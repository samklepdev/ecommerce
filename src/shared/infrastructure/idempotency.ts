import type Redis from 'ioredis';

/**
 * Generic double-submit guard for server actions/routes outside the BTC event
 * path (which has its own ProcessedEventStore). Returns `true` the first time
 * a key is claimed, `false` on every retry within the TTL window — callers
 * should skip the mutating side effect when this returns `false`.
 */
export async function claimIdempotencyKey(
  redis: Redis,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const result = await redis.set(`idempotency:${key}`, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}
