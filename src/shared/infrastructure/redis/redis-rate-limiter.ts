import type Redis from 'ioredis';

import { isRateLimited, type RateLimitResult, type RateLimiter } from '@/shared/application/ports/rate-limiter';

/**
 * Fixed-window counter. `INCR` + `EXPIRE ... NX` (Redis 7+, only sets a TTL
 * if the key doesn't already have one) run as a single pipelined round trip,
 * so the window's TTL is set once on the first hit and never reset by
 * subsequent hits within it. `TTL` is only read on the deny path, to report
 * `retryAfterSeconds` — one extra round trip, but only when it matters.
 *
 * `x-forwarded-for`-derived keys are only trustworthy behind a proxy that
 * sets/strips that header correctly (Vercel does; a bare deployment behind
 * nothing does not) — confirm your deployment target before relying on this
 * for real abuse protection.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'ratelimit:',
  ) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const fullKey = this.prefix + key;

    const results = await this.redis
      .multi()
      .incr(fullKey)
      .expire(fullKey, windowSeconds, 'NX')
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);

    if (!isRateLimited(count, limit)) return { allowed: true };

    const ttl = await this.redis.ttl(fullKey);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }
}
