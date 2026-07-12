import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/config/env';
import * as schema from './schema';

/**
 * Single pooled Postgres connection for the process. In Next dev the module can
 * be re-evaluated on HMR, so we cache on globalThis to avoid connection leaks.
 */
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

const sql = globalForDb.__sql ?? postgres(env.DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== 'production') globalForDb.__sql = sql;

export const db = drizzle(sql, { schema });
export type DB = typeof db;
