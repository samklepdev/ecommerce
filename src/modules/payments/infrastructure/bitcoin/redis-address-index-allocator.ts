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

  /**
   * Idempotently raise the counter floor, never lower it.
   *
   * A Lua script rather than GET-then-SET, because the read-compare-write
   * has to be one step: a concurrent `next()` between the two halves would
   * otherwise be clobbered, and lowering this counter is precisely how an
   * address gets reused.
   */
  async seedFloor(minNextIndex: number): Promise<void> {
    await this.redis.eval(
      `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
       local floor = tonumber(ARGV[1])
       if floor > current then redis.call('SET', KEYS[1], ARGV[1]) end
       return 1`,
      1,
      this.key,
      String(minNextIndex),
    );
  }
}
