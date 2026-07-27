import Link from 'next/link';

import { Dropdown, DropdownDivider, DropdownItem } from '@/components/ui/Dropdown';
import styles from './AdminStrip.module.css';

/** The destinations an admin reaches for most, ordered by how often. The
 * long tail goes behind "More" rather than making the strip scroll. */
const PRIMARY = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Orders', href: '/admin/orders' },
  { label: 'Fulfillment', href: '/admin/fulfillment' },
  { label: 'Products', href: '/admin/products' },
  { label: 'Analytics', href: '/admin/analytics' },
];

const MORE = [
  { label: 'Suppliers', href: '/admin/suppliers' },
  { label: 'Reviews', href: '/admin/reviews' },
  { label: 'Coupons', href: '/admin/coupons' },
  { label: 'Users', href: '/admin/users' },
  { separator: true as const },
  { label: 'Settings', href: '/admin/settings' },
  { label: 'Audit log', href: '/admin/audit-log' },
];

/**
 * A thin bar above the storefront header, shown only to admins.
 *
 * It exists so an admin browsing the shop can jump back into the console
 * without navigating home first. Deliberately in the ink colour rather than
 * the storefront's own surface: it belongs to the console, and looking
 * different is the point.
 */
export function AdminStrip() {
  return (
    <div className={styles.strip}>
      <div className={styles.inner}>
        <span className={styles.tag}>Admin</span>

        <nav className={styles.nav} aria-label="Admin sections">
          {PRIMARY.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}

          <Dropdown align="left" triggerClassName={styles.more} trigger={<span>More ▾</span>}>
            {MORE.map((link, i) =>
              'separator' in link ? (
                <DropdownDivider key={`sep-${i}`} />
              ) : (
                <DropdownItem key={link.href} href={link.href}>
                  {link.label}
                </DropdownItem>
              ),
            )}
          </Dropdown>
        </nav>

        <Link href="/admin" className={styles.exit}>
          Open console →
        </Link>
      </div>
    </div>
  );
}
