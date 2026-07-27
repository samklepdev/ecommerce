'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { navOpenCookie } from './nav-state';
import styles from './AdminChrome.module.css';

interface AdminChromeProps {
  /** Server-rendered account menu, handed through to the topbar so the
   * chrome can be a client component without dragging session lookups
   * into the browser bundle. */
  accountMenu: ReactNode;
  /** Read from a cookie by the layout, so the rail renders in its final
   * state in the first paint instead of snapping after hydration. */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function AdminChrome({ accountMenu, defaultOpen = true, children }: AdminChromeProps) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(defaultOpen);

  function setOpen(next: boolean) {
    setNavOpen(next);
    // Written on the interaction rather than in an effect: a click is the
    // only thing that changes this, so there's nothing to synchronise after.
    document.cookie = navOpenCookie(next);
  }

  // Escape closes it at every width — one of the three ways out, alongside
  // the chevron and clicking outside. Bound only while open, so there's no
  // listener sitting idle the rest of the time.
  useEffect(() => {
    if (!navOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className={styles.shell}>
      <AdminSidebar pathname={pathname} open={navOpen} onClose={() => setOpen(false)} />

      {/* Anything outside the rail — topbar included — counts as "outside".
          It doesn't swallow the click: links and buttons still fire, the nav
          just gets out of the way at the same time. The topbar's burger is
          only rendered while the nav is shut, so its click bubbling up here
          hits the `navOpen` guard and can't undo the open it just did. */}
      <div
        className={styles.main}
        onClick={() => {
          if (navOpen) setOpen(false);
        }}
      >
        <AdminTopbar onOpenNav={() => setOpen(true)} navOpen={navOpen} accountMenu={accountMenu} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
