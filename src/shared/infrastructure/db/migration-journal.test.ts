import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards drizzle's migration journal against the one mistake that silently
 * skips a migration in production and can never be caught by a test suite.
 *
 * ## The trap, from `drizzle-orm/pg-core/dialect.js`
 *
 * ```js
 * const lastDbMigration = (select ... order by created_at desc limit 1);  // ONCE, before the loop
 * for (const migration of migrations) {                                   // journal order
 *   if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) { apply }
 * }
 * ```
 *
 * `folderMillis` is the journal's `when`. So a migration applies only if its
 * `when` is greater than the highest `created_at` **already in the database
 * when the run started** — not greater than the previous migration in the file.
 *
 * Two consequences, and the second is why this file exists:
 *
 * 1. On an **empty** database `lastDbMigration` is undefined, so *everything*
 *    applies regardless of ordering. Every test suite here builds its database
 *    from scratch, so no test can ever observe the bug.
 * 2. On an **existing** database — which is to say production — a migration
 *    whose `when` is below the recorded high-water mark is skipped **silently**:
 *    no error, no DDL, and `migrate()` reports success.
 *
 * This repo had exactly one such pair. `0021` was hand-stamped `1785600000000`
 * (2026-08-01T16:00Z) — a date in the future when it was written — so every
 * migration generated before that wall-clock date sorted below it. Reproduced
 * against a real database: a two-stage deploy (0021, then the rest) applied
 * **26 of 32** migrations, never created the `categories` table, and reported
 * `migrate OK` both times. With the stamp corrected the same two stages apply
 * all 32.
 *
 * `0021` was fixed by lowering it to sit between `0020` and `0022`. Lowering is
 * the safe direction: on a database that has already applied everything, a
 * smaller `when` can never exceed the recorded high-water mark, so nothing
 * re-runs. Raising the ones after it instead would have re-executed
 * `CREATE TABLE categories` on every live database.
 *
 * Keeping `when` strictly increasing with `idx` makes the whole class
 * impossible, because the newest applied migration is then always the
 * high-water mark.
 */
describe('drizzle migration journal', () => {
  const drizzleDir = path.join(process.cwd(), 'drizzle');
  const journal = JSON.parse(
    readFileSync(path.join(drizzleDir, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { idx: number; when: number; tag: string }[] };

  it('has entries', () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it('numbers entries consecutively from 0', () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx, `entry at position ${i} (${entry.tag})`).toBe(i);
    });
  });

  it('keeps `when` strictly increasing, so no migration is ever silently skipped', () => {
    // The load-bearing assertion. A failure here means the migration will not
    // run on any database that has already applied a later-stamped one — with
    // no error at deploy time.
    const offenders: string[] = [];
    journal.entries.forEach((entry, i) => {
      if (i === 0) return;
      const prev = journal.entries[i - 1]!;
      if (entry.when <= prev.when) {
        offenders.push(
          `${entry.tag} (when=${entry.when}) does not come after ${prev.tag} (when=${prev.when})`,
        );
      }
    });

    expect(
      offenders,
      'A migration stamped at or below its predecessor is skipped on any ' +
        'non-empty database. Raise its `when` above every entry before it — ' +
        'note the journal is not in chronological order, so check them all, ' +
        'not just the previous one.',
    ).toEqual([]);
  });

  it('has a .sql file for every entry', () => {
    // `readMigrationFiles` throws at deploy time otherwise — better to fail here.
    for (const entry of journal.entries) {
      const file = path.join(drizzleDir, `${entry.tag}.sql`);
      expect(existsSync(file), `missing ${entry.tag}.sql`).toBe(true);
    }
  });

  it('has no duplicate tags', () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(new Set(tags).size, 'duplicate migration tag').toBe(tags.length);
  });

  it('has a journal entry for every .sql file in the folder', () => {
    // A .sql file nobody references is a migration someone believes they wrote.
    const referenced = new Set(journal.entries.map((e) => `${e.tag}.sql`));
    const onDisk = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'));
    const orphans = onDisk.filter((f) => !referenced.has(f));
    expect(orphans, 'SQL files with no journal entry — these never run').toEqual([]);
  });
});
