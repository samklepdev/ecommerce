'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  /* The drawer has to be portaled out of the header, for the same reason
   * `Modal` portals: `.header` sets `backdrop-filter`, and any element with
   * a filter becomes the containing block for `position: fixed` descendants.
   * So the drawer's `inset: 0` resolved against the 62px-tall header instead
   * of the viewport — it rendered its title row and clipped everything below
   * it, which looked like a menu containing nothing but the word "Menu".
   *
   * Target is the nearest theme scope rather than `document.body`, so the
   * palette variables the drawer reads still resolve (see Modal's note). */
  useEffect(() => {
    const scope = anchorRef.current?.closest<HTMLElement>('[data-theme-scope]');
    setContainer(scope ?? document.body);
  }, []);

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

      <span ref={anchorRef} hidden />

      {container &&
        createPortal(
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
          </div>,
          container,
        )}
    </>
  );
}
