import type Redis from 'ioredis';

import type { AddressIndexAllocator } from '@/modules/payments/application/ports/bitcoin-ports';

/**
 * Atomic, monotonic address-index allocator.
 *
 * INCR is atomic: concurrent checkouts each get a distinct value, no locking,
 * so two orders can never share an index (and therefore never an address).
 *
 * The counter only moves forward and MUST survive restarts. Seed it above the
 * wallet's real next-unused index (see seedFloor). If Redis is ever wiped,
 * reseed from the highest index the wallet has seen — never reset to 0, or a new
 * order would re-derive an address a previous order already used.
 */
export class RedisAddressIndexAllocator implements AddressIndexAllocator {
  constructor(
    private readonly redis: Redis,
    private readonly key = 'btc:addr:next-index',
  ) {}

  async next(): Promise<number> {
    const n = await this.redis.incr(this.key);
    return n - 1; // 0-based index
  }

  /** Idempotently raise the counter floor (e.g. on boot from wallet state). */
  async seedFloor(minNextIndex: number): Promise<void> {
    // Only raise, never lower.
    const current = Number((await this.redis.get(this.key)) ?? '0');
    if (minNextIndex > current) await this.redis.set(this.key, String(minNextIndex));
  }
}
