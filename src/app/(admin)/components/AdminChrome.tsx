'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import styles from './AdminChrome.module.css';

interface AdminChromeProps {
  /** Server-rendered account menu, handed through to the topbar so the
   * chrome can be a client component without dragging session lookups
   * into the browser bundle. */
  accountMenu: ReactNode;
  children: ReactNode;
}

export function AdminChrome({ accountMenu, children }: AdminChromeProps) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <AdminSidebar pathname={pathname} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className={styles.main}>
        <AdminTopbar onOpenNav={() => setNavOpen(true)} accountMenu={accountMenu} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
