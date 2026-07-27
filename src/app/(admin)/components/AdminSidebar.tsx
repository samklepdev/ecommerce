import Link from 'next/link';

import { cx } from '@/components/ui/cx';
import { ADMIN_NAV, isNavItemActive } from './nav-items';
import { ChevronLeftIcon } from './icons';
import styles from './AdminSidebar.module.css';

interface AdminSidebarProps {
  pathname: string;
  /** Expanded (labels) vs collapsed (icons only). The rail itself is always
   * on screen — closed means narrow, not gone. */
  open: boolean;
  /** The chevron, which works both ways. */
  onToggle: () => void;
  /** The backdrop, which only exists below the desktop breakpoint. Escape
   * is handled a level up, where the state lives. */
  onClose: () => void;
}

export function AdminSidebar({ pathname, open, onToggle, onClose }: AdminSidebarProps) {
  return (
    <>
      {/* Only dims below the desktop breakpoint, where expanding overlays
          the page. Above it the rail sits beside the content, so dimming
          would mean a permanently greyed-out page. */}
      <div
        className={cx(styles.backdrop, open && styles.backdropVisible)}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={cx(styles.sidebar, open && styles.sidebarOpen)}>
        <div className={styles.inner}>
          <div className={styles.head}>
            <Link href="/admin" className={styles.brand}>
              <span className={styles.brandMark} aria-hidden="true" />
              <span className={styles.brandText}>
                Storefront
                <span className={styles.brandSub}>Admin console</span>
              </span>
            </Link>

            <button
              type="button"
              className={styles.toggle}
              onClick={onToggle}
              aria-label={open ? 'Collapse menu' : 'Expand menu'}
              aria-expanded={open}
            >
              {/* One icon, rotated when collapsed — it always points the way
                  the rail will move. */}
              <ChevronLeftIcon className={styles.toggleIcon} />
            </button>
          </div>

          <nav className={styles.nav} aria-label="Admin">
            {ADMIN_NAV.map((group) => (
              <div key={group.label} className={styles.group}>
                <h2 className={styles.groupLabel}>{group.label}</h2>
                <ul className={styles.list}>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item.href, pathname);
                    const Icon = item.icon;

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cx(styles.item, active && styles.itemActive)}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon className={styles.itemIcon} />
                          <span className={styles.itemLabel}>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <Link href="/" className={styles.exit}>
            <span className={styles.exitArrow} aria-hidden="true">
              ←
            </span>
            <span className={styles.itemLabel}>Back to storefront</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
