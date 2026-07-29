import type { ComponentType, SVGProps } from 'react';

import {
  ChartIcon,
  FactoryIcon,
  GearIcon,
  GridIcon,
  ListIcon,
  ReceiptIcon,
  StarIcon,
  TagIcon,
  FolderIcon,
  TicketIcon,
  TruckIcon,
  MailIcon,
  UsersIcon,
} from './icons';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface AdminNavGroup {
  /** Shown as the small uppercase label above the group. */
  label: string;
  items: AdminNavItem[];
}

/** Grouped by the job an admin is doing, not by when each page was built —
 * "where do I go to ship an order" and "where do I go to look something up"
 * are different tasks and shouldn't be interleaved in one long list. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Main menu',
    items: [
      { href: '/admin', label: 'Dashboard', icon: GridIcon },
      { href: '/admin/orders', label: 'Orders', icon: ReceiptIcon },
      { href: '/admin/fulfillment', label: 'Fulfillment', icon: TruckIcon },
      { href: '/admin/inquiries', label: 'Inquiries', icon: MailIcon },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/admin/products', label: 'Products', icon: TagIcon },
      { href: '/admin/categories', label: 'Categories', icon: FolderIcon },
      { href: '/admin/suppliers', label: 'Suppliers', icon: FactoryIcon },
      { href: '/admin/coupons', label: 'Coupons', icon: TicketIcon },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/admin/analytics', label: 'Analytics', icon: ChartIcon },
      { href: '/admin/reviews', label: 'Reviews', icon: StarIcon },
      { href: '/admin/audit-log', label: 'Audit log', icon: ListIcon },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users', icon: UsersIcon },
      { href: '/admin/settings', label: 'Settings', icon: GearIcon },
    ],
  },
];

/**
 * Whether `href` is the nav entry for `pathname`.
 *
 * Sub-routes keep their parent lit (`/admin/analytics/page-views` →
 * Analytics), which is why this is a prefix test — but `/admin` is a prefix
 * of every admin route, so Dashboard only matches exactly.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}
