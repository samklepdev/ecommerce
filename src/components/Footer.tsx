import Link from 'next/link';

import { env } from '@/config/env';
import styles from './Footer.module.css';

/** Only routes that exist. The prototype also listed /shipping, /refunds,
 * /pgp, /about/payments and /about/self-custody — none are built, and a
 * footer full of 404s is worse than a short footer. Add them here when the
 * pages land. */
const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', href: '/products' },
      { label: 'Hardware wallets', href: '/products?category=Hardware%20wallets' },
      { label: 'Seed backup', href: '/products?category=Seed%20backup' },
      { label: 'Accessories', href: '/products?category=Accessories' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Find my order', href: '/orders/find' },
      { label: 'Contact support', href: `mailto:${env.SUPPORT_EMAIL}` },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandMark} aria-hidden="true" />
              <span className={styles.brandName}>Storefront</span>
            </Link>
            <p className={styles.tagline}>
              Hardware and backup gear for holding your own keys. Every order settles on-chain,
              straight to our node — we never hold a balance for you.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav className={styles.column} key={column.title} aria-label={column.title}>
              <h3>{column.title}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('mailto:') ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>© {year} Storefront. All rights reserved.</p>
          {/* True of this store, and the one thing a buyer most needs to
              know before reaching checkout. */}
          <span className={styles.payNote}>
            <i aria-hidden="true" />
            On-chain BTC only · non-custodial
          </span>
        </div>
      </div>
    </footer>
  );
}
