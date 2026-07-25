import Link from 'next/link';

import { env } from '@/config/env';
import styles from './Footer.module.css';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Storefront
        </Link>
        <nav className={styles.links}>
          <Link href="/orders/find">Find my order</Link>
          <a href={`mailto:${env.SUPPORT_EMAIL}`}>Contact support</a>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
        <p className={styles.copyright}>© {year} Storefront. All rights reserved.</p>
      </div>
    </footer>
  );
}
