export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  /** Increments the counter for `key` (creating it with `windowSeconds` TTL
   * if absent) and reports whether this call should be allowed. */
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

/** The actual decision — separated from the Redis increment/TTL mechanics
 * so it's testable without infra. */
export function isRateLimited(count: number, limit: number): boolean {
  return count > limit;
}
