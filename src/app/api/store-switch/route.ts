import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import { logger } from '@/shared/infrastructure/logger';
import { checkRateLimit, getClientIp } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 300;

/** Constant-time, and length-safe: `timingSafeEqual` throws on a length
 * mismatch, which would otherwise leak the token's length. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The kill switch from a phone, with no login.
 *
 * `GET /api/store-switch?action=close&token=…` (or the token in an
 * `x-store-switch-token` header, which keeps it out of URLs where that's an
 * option).
 *
 * **Understand the trade-off before using this.** The token is the entire
 * authentication for shutting the shop, and a token in a query string gets
 * written to access logs, proxy logs, and browser history. That's accepted
 * here because the failure mode is a closed store — recoverable in one
 * command — and because the whole point is to work when the admin console
 * doesn't. Rotate it if a log might have been shared, and prefer the header
 * form where you can send one.
 *
 * Unset `STORE_SWITCH_TOKEN` disables this route rather than leaving it open.
 *
 * It's a GET so it works from anywhere a URL does, which does mean a link
 * prefetch could fire it — but only from something that already holds the
 * token, and the reachable damage is a closure. `action` is required, so
 * there's no single URL that toggles unpredictably.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const expected = env.STORE_SWITCH_TOKEN;
  if (!expected) {
    // 404, not 403: an endpoint that says "wrong token" has confirmed it
    // exists and is worth guessing at.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Rate limited by IP so the token can't be brute-forced, and shared across
  // both good and bad attempts — this endpoint is used once in a crisis, not
  // in a loop.
  const ip = await getClientIp();
  const limit = await checkRateLimit(`store-switch:${ip}`, RATE_LIMIT_ATTEMPTS, RATE_LIMIT_WINDOW_SECONDS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const provided =
    request.headers.get('x-store-switch-token') ?? request.nextUrl.searchParams.get('token') ?? '';
  if (!tokenMatches(provided, expected)) {
    // Never log the provided value — a near-miss token in a log is still a
    // token in a log.
    logger.warn('store switch: rejected an attempt with a bad token', { ip });
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const action = request.nextUrl.searchParams.get('action');
  if (action !== 'close' && action !== 'open' && action !== 'status') {
    return NextResponse.json({ error: 'action must be close, open, or status' }, { status: 400 });
  }

  const { getStoreAvailability, setStoreAvailability } = getContainer();

  if (action === 'status') {
    const { isOpen, closure } = await getStoreAvailability.execute();
    return NextResponse.json(
      { open: isOpen, closedAt: closure?.closedAt.toISOString() ?? null },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  await setStoreAvailability.execute({
    isOpen: action === 'open',
    reason: request.nextUrl.searchParams.get('reason'),
    // No session behind this door; the audit entry records which door it was.
    actor: { userId: null, email: 'token' },
  });

  return NextResponse.json(
    { open: action === 'open' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
