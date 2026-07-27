import { headers } from 'next/headers';

import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import type { RateLimitResult } from '@/shared/application/ports/rate-limiter';

/** Best-effort client IP from `x-forwarded-for`. Only trustworthy behind a
 * proxy that sets/strips this header correctly (Vercel does; a bare
 * deployment behind nothing does not) — the rate limiters keyed on this are
 * spoofable if that assumption doesn't hold for your deployment target. */
export async function getClientIp(): Promise<string> {
  // Checked first, and unconditionally: locally the header *is* present, set
  // to the loopback address `::1`, which resolves to no country. A fallback
  // that only applied when the header was missing would therefore never fire
  // — the whole point of the override is to replace a useless real value.
  // `env` forces this to undefined outside development, so it cannot put a
  // fabricated address into real data.
  if (env.ANALYTICS_DEV_IP) return env.ANALYTICS_DEV_IP;

  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
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

export function tooManyAttemptsMessage(retryAfterSeconds: number | undefined): string {
  const minutes = Math.ceil((retryAfterSeconds ?? 60) / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
