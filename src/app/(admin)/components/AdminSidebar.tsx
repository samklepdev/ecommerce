import Link from 'next/link';

import { cx } from '@/components/ui/cx';
import { ADMIN_NAV, isNavItemActive } from './nav-items';
import { CloseIcon } from './icons';
import styles from './AdminSidebar.module.css';

interface AdminSidebarProps {
  pathname: string;
  /** Drawer state — only consulted below the desktop breakpoint, where the
   * sidebar slides in over the content instead of sitting beside it. */
  open: boolean;
  /** Called on the backdrop, the close button, and every nav link: following
   * a link should land you on the new page, not on the new page with the
   * drawer still covering it. */
  onClose: () => void;
}

export function AdminSidebar({ pathname, open, onClose }: AdminSidebarProps) {
  return (
    <>
      <div
        className={cx(styles.backdrop, open && styles.backdropVisible)}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* The <aside> stretches to the full height of the page so its navy
          runs to the bottom however long the content is; `.inner` is what
          sticks to the viewport as you scroll. */}
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
              className={styles.close}
              onClick={onClose}
              aria-label="Close menu"
            >
              <CloseIcon className={styles.closeIcon} />
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
                        >
                          <Icon className={styles.itemIcon} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <Link href="/" className={styles.exit} onClick={onClose}>
            ← Back to storefront
          </Link>
        </div>
      </aside>
    </>
  );
}
