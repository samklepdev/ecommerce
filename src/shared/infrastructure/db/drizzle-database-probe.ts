import { sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import type { ServiceProbe } from '@/shared/application/ports/health-ports';

/** Cheapest possible round trip that proves the pool can still reach
 * Postgres and get an answer — not a table read, so it stays honest about
 * connectivity rather than about any one schema object. */
export class DrizzleDatabaseProbe implements ServiceProbe {
  constructor(private readonly db: DB) {}

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
