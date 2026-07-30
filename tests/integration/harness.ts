import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as raw } from 'drizzle-orm';
import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeEach } from 'vitest';

import * as schema from '@/shared/infrastructure/db/schema';
import type { DB } from '@/shared/infrastructure/db/client';
import { assertSafeTestTarget, TEST_DATABASE_URL, TEST_REDIS_URL } from './config';

/**
 * One database and one Redis per test file, wiped before every test.
 *
 * Connections are built here rather than imported from
 * `shared/infrastructure/db/client` on purpose: that module reads
 * `env.DATABASE_URL` at import time and would point the suite at whatever
 * `.env` says — which is the development database. Repositories take their
 * connection as a constructor argument, so tests can hand them a different
 * one without touching global state.
 */
export function useTestInfrastructure() {
  assertSafeTestTarget(TEST_DATABASE_URL);
  assertSafeTestTarget(TEST_REDIS_URL);

  const client = postgres(TEST_DATABASE_URL, { max: 4, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 2 });

  beforeEach(async () => {
    await truncateAll(db);
    await redis.flushdb();
  });

  afterAll(async () => {
    await client.end();
    await redis.quit();
  });

  return { db, redis, client };
}

/**
 * Empties every table in one statement.
 *
 * `TRUNCATE ... CASCADE` rather than deleting per table in dependency order:
 * the order is a moving target as the schema grows, and getting it wrong
 * surfaces as a foreign-key error in an unrelated test. `drizzle_migrations`
 * is excluded — dropping it would make the next file re-run migrations.
 */
export async function truncateAll(db: DB): Promise<void> {
  const tables = await db.execute<{ tablename: string }>(raw`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '__drizzle_migrations'
  `);

  const names = [...tables].map((row) => `"public"."${row.tablename}"`);
  if (names.length === 0) return;

  await db.execute(raw.raw(`truncate table ${names.join(', ')} restart identity cascade`));
}
