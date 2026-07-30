import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import { logger } from '@/shared/infrastructure/logger';
import { getClientIp } from '@/app/lib/rate-limit';
import { decodeBase32, TOTP_STEP_SECONDS, verifyTotp } from '@/shared/infrastructure/totp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Attempts past the path check, global rather than per-IP.
 *
 * Global because `getClientIp` reads `x-forwarded-for`, which a caller sets
 * freely unless a trusted proxy overwrites it — a per-IP limit on a public
 * endpoint is decoration, side-stepped by rotating one header.
 *
 * And it has to actually *block*, not just warn: six digits is a million
 * combinations, three of them valid at any moment, so an unthrottled attacker
 * who knows the path lands a code in minutes at a few hundred requests a
 * second. Twenty tries per ten minutes puts that out of reach.
 *
 * If an attacker does burn the budget, this door closes for a while — but
 * you're not locked out of the switch itself: the admin toggle and
 * `npm run store:close` are unaffected. Reaching the budget at all requires
 * already knowing a 32-character secret path.
 */
const ATTEMPT_BUDGET = 20;
const ATTEMPT_WINDOW_SECONDS = 600;

/** Every rejection looks identical from outside — same status, same body, no
 * timing signal worth reading. A response that distinguishes "wrong path"
 * from "wrong code" has confirmed the endpoint exists and is worth attacking. */
function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}

function pathMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The kill switch from a phone, with no login.
 *
 * `GET /api/ops/<STORE_SWITCH_PATH>?action=close&code=<6 digits>`
 *
 * Two secrets, neither in this repo: the path segment (from env) and a TOTP
 * shared secret held in your authenticator app. `npm run store:switch-setup`
 * generates both.
 *
 * **Why a rotating code rather than a static token.** The URL ends up in
 * access logs, proxy logs and browser history — that's unavoidable for
 * something you hit from a phone. A static token there is a working kill
 * switch forever; a TOTP code is worthless 30 seconds later, and can't be
 * replayed even inside its own window because a used step is burned below.
 *
 * What this still isn't: device-bound. Anyone holding both secrets can call
 * it from anywhere. If you want it unreachable rather than merely
 * unguessable, put it behind a private network (Tailscale/WireGuard) — see
 * the deployment notes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const expectedPath = env.STORE_SWITCH_PATH;
  const secretBase32 = env.STORE_SWITCH_TOTP_SECRET;
  // Not configured: the route genuinely does not exist.
  if (!expectedPath || !secretBase32) return notFound();

  const { key } = await params;
  const ip = await getClientIp();
  const { rateLimiter, getStoreAvailability, setStoreAvailability } = getContainer();

  if (!pathMatches(key, expectedPath)) {
    // Logged without the attempted value: a near-miss secret in a log is
    // still a secret in a log. Deliberately does not touch the budget below —
    // the path is unguessable, so scanners can't use it to close this door.
    logger.warn('store switch: request to a wrong path segment', { ip });
    return notFound();
  }

  const budget = await rateLimiter.consume(
    'store-switch:attempts',
    ATTEMPT_BUDGET,
    ATTEMPT_WINDOW_SECONDS,
  );
  if (!budget.allowed) {
    logger.error('store switch: attempt budget exhausted — possible brute force', { ip });
    return notFound();
  }

  const code = request.nextUrl.searchParams.get('code') ?? '';
  const secret = decodeBase32(secretBase32);
  if (!secret) {
    logger.error('store switch: STORE_SWITCH_TOTP_SECRET is not valid base32');
    return notFound();
  }

  const verification = verifyTotp(secret, code);
  if (!verification.valid) {
    logger.warn('store switch: rejected an invalid code', { ip });
    return notFound();
  }

  const action = request.nextUrl.searchParams.get('action');
  if (action !== 'close' && action !== 'open' && action !== 'status') {
    return NextResponse.json({ error: 'action must be close, open, or status' }, { status: 400 });
  }

  // Single-use, but idempotent for the *same* request.
  //
  // Burning the code outright was right for security and wrong in practice:
  // this is a URL opened in a browser, and browsers re-request. A refresh, a
  // back-navigation, or an omnibox prefetch would spend the code and the
  // real attempt would 404 — indistinguishable from a broken kill switch, at
  // the exact moment you need to trust it.
  //
  // So the step is burned per action. Repeating the same code with the same
  // action is a no-op that reports the current state; using it for a
  // *different* action is still refused, which is what replay protection is
  // actually for — a code lifted from a log can't be turned into the
  // opposite instruction.
  const stepUnused = (
    await rateLimiter.consume(`store-switch:step:${verification.step}`, 1, TOTP_STEP_SECONDS * 3)
  ).allowed;
  const actionUnused = (
    await rateLimiter.consume(
      `store-switch:step:${verification.step}:${action}`,
      1,
      TOTP_STEP_SECONDS * 3,
    )
  ).allowed;

  if (!stepUnused && actionUnused) {
    logger.warn('store switch: refused a used code re-aimed at a different action', { ip, action });
    return notFound();
  }

  const isRepeat = !actionUnused;

  if (action === 'status') {
    const { isOpen, closure } = await getStoreAvailability.execute();
    return NextResponse.json(
      { open: isOpen, closedAt: closure?.closedAt.toISOString() ?? null },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  // A repeat doesn't re-run the switch: it would write a second audit entry
  // and sign customers out twice for one instruction. The state is already
  // what was asked for, so reporting it is the honest response.
  if (!isRepeat) {
    await setStoreAvailability.execute({
      isOpen: action === 'open',
      reason: request.nextUrl.searchParams.get('reason'),
      // No session behind this door; the audit entry records which door it was.
      actor: { userId: null, email: 'ops-url' },
    });

    logger.warn(`store switch: store ${action === 'open' ? 'REOPENED' : 'CLOSED'} via the ops URL`, {
      ip,
    });
  }

  return NextResponse.json(
    { open: action === 'open' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
