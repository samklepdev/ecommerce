import { headers, cookies } from 'next/headers';
import { after } from 'next/server';

import { getContainer } from '@/composition/container';
import { getSessionUser, GUEST_SESSION_COOKIE } from '@/app/lib/session';
import { getClientIp } from '@/app/lib/rate-limit';
import { StorefrontChrome } from '@/components/StorefrontChrome';
import { PageDwellTracker } from './PageDwellTracker';
import { StoreClosed } from './StoreClosed';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  // The kill switch, checked before anything else this layout does. Closing
  // the shop shouldn't cost a page view record or a session lookup.
  //
  // Only the customer-facing group is gated. `/login` lives in `(auth)` and
  // `/admin` in `(admin)`, both untouched — otherwise closing the store
  // would lock you out of the console you reopen it from.
  const { getStoreAvailability } = getContainer();
  const { isOpen } = await getStoreAvailability.execute();
  if (!isOpen) {
    return (
      <StorefrontChrome>
        <StoreClosed />
      </StorefrontChrome>
    );
  }

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

  return (
    <>
      <PageDwellTracker />
      <StorefrontChrome>{children}</StorefrontChrome>
    </>
  );
}
