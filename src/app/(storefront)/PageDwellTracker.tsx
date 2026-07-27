'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Ignore anything longer than this. A tab left open overnight is not four
 * hours of reading, and one such visit would swamp the mean for its path. */
const MAX_DWELL_MS = 30 * 60 * 1000;

/** Below this it's a bounce or a redirect, not a page view worth timing. */
const MIN_DWELL_MS = 250;

/**
 * Reports how long the visitor stayed on each page.
 *
 * Fires on `visibilitychange → hidden` and `pagehide` rather than
 * `beforeunload`: mobile browsers (iOS Safari especially) routinely discard
 * a backgrounded tab without ever firing `beforeunload`, so timing built on
 * it silently loses most mobile traffic. `sendBeacon` is used because a
 * normal fetch is cancelled when the page goes away.
 *
 * The beacon carries only the path and a duration. The session and the
 * visitor's country are both resolved server-side, so a client can't
 * attribute time to someone else's session or invent a location.
 */
export function PageDwellTracker() {
  const pathname = usePathname();
  // Initialised in the effect, not here: calling Date.now() during render
  // is impure, and the effect runs before any exit event can fire anyway.
  const startedAt = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    // A client-side navigation is a new page view; reset both the clock and
    // the already-sent guard.
    startedAt.current = Date.now();
    sent.current = false;

    function report() {
      if (sent.current) return;

      const durationMs = Date.now() - startedAt.current;
      if (durationMs < MIN_DWELL_MS || durationMs > MAX_DWELL_MS) return;

      sent.current = true;
      const body = JSON.stringify({ path: pathname, durationMs });

      // Guarded: sendBeacon is absent in some embedded webviews, and a
      // failed analytics ping must never surface to a visitor.
      try {
        navigator.sendBeacon?.(
          '/api/analytics/page-exit',
          new Blob([body], { type: 'application/json' }),
        );
      } catch {
        // Ignored by design.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') report();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', report);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', report);
      // Leaving via a client-side navigation: the page isn't unloading, so
      // neither event fires, and this cleanup is the only exit signal.
      report();
    };
  }, [pathname]);

  return null;
}
