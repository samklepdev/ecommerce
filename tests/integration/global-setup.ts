import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { TEST_DATABASE_URL, TEST_REDIS_URL } from './config';

/**
 * Brings the schema up once for the whole run.
 *
 * Migrating here rather than per-file matters: the suite runs files
 * serially against one database, and `migrate()` is not something you want
 * racing itself.
 *
 * The wait loop exists because `docker compose up -d` returns before
 * Postgres is accepting connections, and a healthcheck only helps if the
 * caller waits on it — in CI the service container is ready, locally it may
 * have just started.
 */
export default async function setup(): Promise<void> {
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });

  await waitFor(async () => {
    await sql`select 1`;
  }, 'Postgres');

  // Applied from nothing every run. This is also a real check on the
  // migration files themselves — the same thing CI does separately.
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();

  const { default: Redis } = await import('ioredis');
  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await waitFor(async () => {
    await redis.connect();
    await redis.ping();
  }, 'Redis');
  await redis.quit();
}

async function waitFor(probe: () => Promise<unknown>, label: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await probe();
      return;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw new Error(
    `${label} was not reachable within 30s. Start the test services with:\n` +
      '  docker compose -f docker-compose.test.yml up -d\n' +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
