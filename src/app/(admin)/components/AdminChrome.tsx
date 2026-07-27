'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { navCollapsedCookie } from './nav-collapse';
import styles from './AdminChrome.module.css';

interface AdminChromeProps {
  /** Server-rendered account menu, handed through to the topbar so the
   * chrome can be a client component without dragging session lookups
   * into the browser bundle. */
  accountMenu: ReactNode;
  /** Read from a cookie by the layout, so the rail renders at its final
   * width in the first paint instead of snapping shut after hydration. */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export function AdminChrome({ accountMenu, defaultCollapsed = false, children }: AdminChromeProps) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // Written here rather than in an effect: the click is the only thing
    // that changes this, so there's nothing to synchronise afterwards.
    document.cookie = navCollapsedCookie(next);
  }

  return (
    <div className={styles.shell}>
      <AdminSidebar
        pathname={pathname}
        open={navOpen}
        collapsed={collapsed}
        onClose={() => setNavOpen(false)}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className={styles.main}>
        <AdminTopbar onOpenNav={() => setNavOpen(true)} accountMenu={accountMenu} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
