'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Slow on purpose. This runs for every visitor for the whole time they have
 * a tab open, to catch something that happens a handful of times a year —
 * the focus check below is what makes it feel immediate, not the interval. */
const POLL_MS = 30_000;

/**
 * Flips an already-open tab between the storefront and the paused notice
 * without the visitor pressing reload.
 *
 * Server-rendered pages only change when the browser asks again, so closing
 * the shop left anyone mid-visit looking at a live-looking storefront. They
 * couldn't buy anything — every write refuses server-side — but it looked
 * like the switch hadn't worked.
 *
 * Two triggers, cheap ones:
 *
 * - **Tab regains focus.** A backgrounded tab is the common case and it
 *   costs nothing to check on the way back, so the update lands exactly when
 *   someone starts looking.
 * - **A slow poll while visible**, for a tab left open in front of someone.
 *   Skipped entirely while hidden, so a wall of background tabs isn't a wall
 *   of requests.
 *
 * `router.refresh()` only when the answer actually differs from what the
 * server rendered — a refresh on every tick would re-fetch every page in the
 * app for nothing.
 */
export function StoreStatusWatcher({ isOpen }: { isOpen: boolean }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/store-status', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { open?: unknown };
        if (typeof data.open !== 'boolean') return;
        if (data.open !== isOpen) router.refresh();
      } catch {
        // Offline or a blip — the next tick tries again. A failed check must
        // never itself change what the visitor sees.
      }
    }

    const interval = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [isOpen, router]);

  return null;
}
