import type Redis from 'ioredis';
import { eq } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { users } from '@/shared/infrastructure/db/schema';
import { logger } from '@/shared/infrastructure/logger';
import type { CustomerSessionRevoker } from '@/shared/application/ports/customer-session-revoker';

interface StoredSession {
  userId: string;
}

/** Batch size for the SCAN cursor. Small enough that a big session set never
 * parks Redis on one call, large enough not to round-trip forever. */
const SCAN_COUNT = 200;

/**
 * Sessions live in Redis under `session:<id>` with the user id inside the
 * value, so "sign out every customer" means walking the keyspace and
 * deciding per key.
 *
 * **SCAN, never KEYS.** `KEYS session:*` blocks Redis for the length of the
 * scan, and Redis is on the path of every request this app serves — cart,
 * rate limiting, the BTC address counter. Closing the store must not take
 * the site down as a side effect.
 *
 * Admin ids are fetched once up front rather than per key: the set is tiny,
 * and the alternative is a database round trip per session.
 */
export class RedisCustomerSessionRevoker implements CustomerSessionRevoker {
  constructor(
    private readonly redis: Redis,
    private readonly db: DB,
    private readonly prefix = 'session:',
  ) {}

  async revokeAllCustomerSessions(): Promise<number> {
    try {
      const adminRows = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'));
      const adminIds = new Set(adminRows.map((row) => row.id));

      let cursor = '0';
      let revoked = 0;

      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${this.prefix}*`,
          'COUNT',
          SCAN_COUNT,
        );
        cursor = next;
        if (keys.length === 0) continue;

        const values = await this.redis.mget(keys);
        const doomed: string[] = [];

        for (const [index, raw] of values.entries()) {
          const key = keys[index]!;
          // A key that vanished mid-scan, or holds something unreadable, is
          // not a session anyone is using — leave it to its TTL rather than
          // guessing.
          if (!raw) continue;
          try {
            const { userId } = JSON.parse(raw) as StoredSession;
            if (!adminIds.has(userId)) doomed.push(key);
          } catch {
            continue;
          }
        }

        if (doomed.length > 0) {
          await this.redis.del(...doomed);
          revoked += doomed.length;
        }
      } while (cursor !== '0');

      return revoked;
    } catch (e) {
      // Swallowed on purpose, per the port: the store still closes. A
      // customer left signed in can't order, can't write, and sees the
      // paused notice on every page.
      logger.error('failed to revoke customer sessions while closing the store', {
        error: e instanceof Error ? e.message : String(e),
      });
      return 0;
    }
  }
}
