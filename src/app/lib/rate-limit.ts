import { headers } from 'next/headers';

import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import type { RateLimitResult } from '@/shared/application/ports/rate-limiter';
import { clientIpFromForwardedFor } from './client-ip';

/**
 * The client's IP, or `null` when it cannot be established.
 *
 * Read from the **right** of `x-forwarded-for`, skipping
 * `TRUSTED_PROXY_HOPS` appended entries — see `clientIpFromForwardedFor` for
 * why the left-hand end is caller-controlled and what that cost.
 *
 * Null is a real answer, not a failure: with no trusted proxy the header is
 * hearsay. Callers must decide what an unidentifiable client means for them
 * rather than being handed a shared `'unknown'` bucket, which turned one
 * visitor's traffic into everyone else's rate limit.
 */
export async function getClientIp(): Promise<string | null> {
  // Checked first, and unconditionally: locally the header *is* present, set
  // to the loopback address `::1`, which resolves to no country. A fallback
  // that only applied when the header was missing would therefore never fire
  // — the whole point of the override is to replace a useless real value.
  // `env` forces this to undefined outside development, so it cannot put a
  // fabricated address into real data.
  if (env.ANALYTICS_DEV_IP) return env.ANALYTICS_DEV_IP;

  const headerStore = await headers();
  return clientIpFromForwardedFor(headerStore.get('x-forwarded-for'), env.TRUSTED_PROXY_HOPS);
}

/** Thin wrapper over the container's `RateLimiter`, mirroring `requireAdmin`/
 * `requireUser`'s style: a small `app/lib` helper for a cross-cutting
 * concern that isn't a use case (no business entity involved). */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { rateLimiter } = getContainer();
  return rateLimiter.consume(key, limit, windowSeconds);
}

/**
 * A rate-limit key segment for a client whose IP may be unknown.
 *
 * Exists because `getClientIp` can now legitimately return null, and a
 * template literal will happily render that as the string `"null"` — so every
 * caller would silently share one bucket named after a bug. Naming the
 * fallback makes it a decision instead of an accident.
 *
 * Unidentified clients share a bucket, which is the honest consequence: if we
 * cannot tell two callers apart, we cannot give them separate budgets. That is
 * acceptable for limits whose job is to slow abuse (signup, inquiries) and
 * *not* acceptable where one visitor could lock out everyone else — so the
 * limits that matter most, login and the payment-status poll, carry a second
 * key of their own (an account, an order) rather than relying on this.
 */
export function ipKeySegment(ip: string | null): string {
  return ip ?? 'unidentified';
}

export function tooManyAttemptsMessage(retryAfterSeconds: number | undefined): string {
  const minutes = Math.ceil((retryAfterSeconds ?? 60) / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
