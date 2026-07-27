import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { getSessionUser, GUEST_SESSION_COOKIE } from '@/app/lib/session';
import { checkRateLimit, getClientIp } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Mirrors the client's own guards. Re-checked here because the endpoint is
 * public and unauthenticated — a client could post any number it likes, and
 * one absurd value would swamp the mean for its path. */
const MAX_DWELL_MS = 30 * 60 * 1000;
const MIN_DWELL_MS = 250;

const bodySchema = z.object({
  path: z.string().min(1).max(2048),
  durationMs: z.number().int().min(MIN_DWELL_MS).max(MAX_DWELL_MS),
});

/** A page view can legitimately produce one beacon per navigation, so this
 * is generous — it exists to stop a script hammering the endpoint, not to
 * police normal browsing. */
const RATE_LIMIT = 120;
const RATE_WINDOW_SECONDS = 60;

/**
 * Records how long a visitor stayed on a page, beaconed by
 * `PageDwellTracker` as the page goes away.
 *
 * Always answers 204, whatever happened. This is fire-and-forget telemetry
 * sent by `navigator.sendBeacon`, which discards the response — reporting an
 * error would tell nobody anything, and a failed analytics write must never
 * affect a visitor.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = await getClientIp();
    const limit = await checkRateLimit(`page-exit:${ip}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
    if (!limit.allowed) return new NextResponse(null, { status: 204 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return new NextResponse(null, { status: 204 });

    // Resolved server-side, never taken from the body: a client must not be
    // able to attribute time spent to someone else's session.
    const [user, cookieStore] = await Promise.all([getSessionUser(), cookies()]);
    const sessionId = user ? user.id : (cookieStore.get(GUEST_SESSION_COOKIE)?.value ?? null);

    const { recordAnalyticsEvent } = getContainer();
    await recordAnalyticsEvent.execute({
      eventType: 'page_exit',
      sessionId,
      userId: user?.id ?? null,
      path: parsed.data.path,
      ipAddress: ip,
      metadata: { durationMs: parsed.data.durationMs },
    });
  } catch {
    // Swallowed by design — see the doc comment.
  }

  return new NextResponse(null, { status: 204 });
}
