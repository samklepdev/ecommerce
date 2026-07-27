import Link from 'next/link';

import { cx } from '@/components/ui/cx';
import { ADMIN_NAV, isNavItemActive } from './nav-items';
import { ChevronLeftIcon, CloseIcon } from './icons';
import styles from './AdminSidebar.module.css';

interface AdminSidebarProps {
  pathname: string;
  /** Drawer state — only consulted below the desktop breakpoint, where the
   * sidebar slides in over the content instead of sitting beside it. */
  open: boolean;
  /** Icon-only rail. Desktop only; the mobile drawer is always full width,
   * since there's no room to save when it's an overlay. */
  collapsed: boolean;
  /** Called on the backdrop, the close button, and every nav link: following
   * a link should land you on the new page, not on the new page with the
   * drawer still covering it. */
  onClose: () => void;
  onToggleCollapsed: () => void;
}

export function AdminSidebar({
  pathname,
  open,
  collapsed,
  onClose,
  onToggleCollapsed,
}: AdminSidebarProps) {
  return (
    <>
      <div
        className={cx(styles.backdrop, open && styles.backdropVisible)}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cx(styles.sidebar, open && styles.sidebarOpen, collapsed && styles.collapsed)}
      >
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
              className={styles.close}
              onClick={onClose}
              aria-label="Close menu"
            >
              <CloseIcon className={styles.closeIcon} />
            </button>

            <button
              type="button"
              className={styles.collapseToggle}
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={collapsed}
            >
              <ChevronLeftIcon className={styles.collapseIcon} />
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
                          onClick={onClose}
                          // The label is the only thing identifying an entry
                          // once it's icon-only, so it moves to the tooltip.
                          title={collapsed ? item.label : undefined}
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

          <Link
            href="/"
            className={styles.exit}
            onClick={onClose}
            title={collapsed ? 'Back to storefront' : undefined}
          >
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
