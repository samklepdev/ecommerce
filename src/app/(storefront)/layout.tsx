import { headers, cookies } from 'next/headers';
import { after } from 'next/server';

import { getContainer } from '@/composition/container';
import { getSessionUser, GUEST_SESSION_COOKIE } from '@/app/lib/session';
import { getClientIp } from '@/app/lib/rate-limit';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const path = headerStore.get('x-pathname');
  const referrer = headerStore.get('referer');
  const userAgent = headerStore.get('user-agent');

  const [user, ip, cookieStore] = await Promise.all([getSessionUser(), getClientIp(), cookies()]);
  const sessionId = user ? user.id : (cookieStore.get(GUEST_SESSION_COOKIE)?.value ?? null);

  // Fire-and-forget-but-guaranteed: after() runs once the response has
  // already been sent, so tracking never adds latency to the page load,
  // and (unlike a bare unawaited promise) Next.js keeps the request alive
  // long enough for it to finish.
  after(async () => {
    const { recordAnalyticsEvent } = getContainer();
    try {
      await recordAnalyticsEvent.execute({
        eventType: 'page_view',
        sessionId,
        userId: user?.id ?? null,
        path,
        referrer,
        userAgent,
        ipAddress: ip,
      });
    } catch {
      // Best-effort — a tracking failure must never surface to a visitor.
    }
  });

  return children;
}
