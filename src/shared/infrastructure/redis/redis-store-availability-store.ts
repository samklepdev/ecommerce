import type Redis from 'ioredis';
import { z } from 'zod';

import { logger } from '@/shared/infrastructure/logger';
import type {
  StoreAvailabilityStore,
  StoreClosure,
} from '@/shared/application/ports/store-availability';

/** No TTL. A kill switch that expires on its own is not a kill switch — the
 * store would quietly reopen at 3am because a key aged out. */
const KEY = 'store:closed';

const StoredClosureSchema = z.object({
  closedAt: z.string().datetime(),
  reason: z.string().nullable(),
  closedBy: z.string().min(1),
});

export class RedisStoreAvailabilityStore implements StoreAvailabilityStore {
  constructor(private readonly redis: Redis) {}

  async read(): Promise<StoreClosure | null> {
    const raw = await this.redis.get(KEY);
    if (!raw) return null;

    // Parsed, not cast — but a malformed value still means closed. Someone
    // wrote this key on purpose; the safe reading of "closed, details
    // unreadable" is closed, not open.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const result = StoredClosureSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn('store kill switch key is set but unreadable; treating the store as closed');
      return { closedAt: new Date(0), reason: null, closedBy: 'unknown' };
    }

    return {
      closedAt: new Date(result.data.closedAt),
      reason: result.data.reason,
      closedBy: result.data.closedBy,
    };
  }

  async close(closure: StoreClosure): Promise<void> {
    await this.redis.set(
      KEY,
      JSON.stringify({
        closedAt: closure.closedAt.toISOString(),
        reason: closure.reason,
        closedBy: closure.closedBy,
      }),
    );
  }

  async open(): Promise<void> {
    await this.redis.del(KEY);
  }
}
