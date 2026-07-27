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

  // Escape collapses it at every width, the chevron being the other way.
  // Bound only while expanded, so there's no listener sitting idle the rest
  // of the time.
  useEffect(() => {
    if (!navOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    // `data-theme-scope`: the admin palette is declared on this element,
    // so anything portaled (see Modal) has to land inside it or it gets
    // the bare :root theme instead.
    <div className={styles.shell} data-theme-scope>
      <AdminSidebar
        pathname={pathname}
        open={navOpen}
        onToggle={() => setOpen(!navOpen)}
        onClose={() => setOpen(false)}
      />

      {/* No collapse-on-click out here: clicking a link is a request to
          navigate, and collapsing the rail at the same time is a second
          thing nobody asked for. Escape and the chevron are the ways out.
          (The backdrop still closes, but that only exists below the
          breakpoint, where it's dimmed overlay rather than page content.) */}
      <div className={styles.main}>
        <AdminTopbar accountMenu={accountMenu} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
