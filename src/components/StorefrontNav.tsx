'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cx } from '@/components/ui/cx';
import styles from './Header.module.css';

export interface NavLink {
  label: string;
  href: string;
}

interface StorefrontNavProps {
  links: NavLink[];
  itemCount: number;
  /** Rendered inside the mobile drawer under a divider — the account links
   * the desktop header keeps in a dropdown. */
  drawerAccount: React.ReactNode;
}

/**
 * Primary nav plus the mobile drawer.
 *
 * Client-side because two things need the browser: the current path, to mark
 * where you are, and the drawer's open state. The rest of the header stays
 * on the server so the session and cart lookups don't cross the boundary.
 */
export function StorefrontNav({ links, itemCount, drawerAccount }: StorefrontNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    // The page behind a modal drawer shouldn't scroll under it.
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav className={styles.nav} aria-label="Primary">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cx(isActive(link.href) && styles.navOn)}
            aria-current={isActive(link.href) ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        className={styles.burger}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={cx(styles.drawerWrap, open && styles.drawerOpen)} aria-hidden={!open}>
        <div className={styles.scrim} onClick={() => setOpen(false)} />
        <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Menu">
          <div className={styles.drawerHead}>
            <span className={styles.brandName}>Menu</span>
            <button
              type="button"
              className={styles.drawerX}
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <nav className={styles.drawerNav}>
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href="/cart" onClick={() => setOpen(false)}>
              Cart
              {itemCount > 0 && <span className={styles.cartBadge}>{itemCount}</span>}
            </Link>
          </nav>

          <hr className={styles.drawerSep} />
          <div className={styles.drawerNav} onClick={() => setOpen(false)}>
            {drawerAccount}
          </div>
        </aside>
      </div>
    </>
  );
}
