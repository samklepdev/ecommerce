import { NextResponse } from 'next/server';

import { logger } from '@/shared/infrastructure/logger';
import { getContainer } from '@/composition/container';
import { checkRateLimit, getClientIp } from '@/app/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 1x1 transparent GIF — the smallest valid tracking pixel.
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);

/** Hit by an email client rendering the `<img>` tag in the welcome email —
 * never by a logged-in session, so there's no auth check here. Fails
 * closed/silently on an unknown or already-opened token (the guarded
 * `markOpened` update just affects 0 rows) and always returns the pixel
 * regardless, since a broken tracking pixel would otherwise show up as a
 * broken image in the recipient's inbox. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // Generous, because a mail client can legitimately fetch this a few times
  // (preview pane, then open, then a forward), and several recipients can
  // share one corporate egress IP. It exists to stop someone hammering the
  // endpoint to brute-force tracking tokens, not to police inboxes.
  //
  // Over the limit we still return the pixel: a broken image in someone's
  // inbox is a worse outcome than an unrecorded open, and the write below is
  // simply skipped.
  const ip = await getClientIp();
  const limit = await checkRateLimit(`email-track:${ip}`, 60, 60);

  try {
    if (!limit.allowed) throw new Error('rate limited');
    const { markWelcomeEmailOpened } = getContainer();
    await markWelcomeEmailOpened.execute({ trackingToken: id });
  } catch (e) {
    logger.warn('welcome email tracking: failed to mark opened', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  });
}
