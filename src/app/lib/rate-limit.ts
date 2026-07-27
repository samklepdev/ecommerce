import { headers } from 'next/headers';

import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import type { RateLimitResult } from '@/shared/application/ports/rate-limiter';

/** Best-effort client IP from `x-forwarded-for`. Only trustworthy behind a
 * proxy that sets/strips this header correctly (Vercel does; a bare
 * deployment behind nothing does not) — the rate limiters keyed on this are
 * spoofable if that assumption doesn't hold for your deployment target. */
export async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim();
  if (ip) return ip;

  // Nothing set the header. In development that's every request to
  // localhost, which leaves the country breakdown permanently empty while
  // you're building it — ANALYTICS_DEV_IP stands in so the feature is
  // visible. `env` forces it to undefined outside development, so it can
  // never put a fabricated address into real data.
  return env.ANALYTICS_DEV_IP ?? 'unknown';
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
