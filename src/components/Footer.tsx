import Link from 'next/link';

import styles from './Footer.module.css';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Storefront
        </Link>
        <p className={styles.copyright}>© {year} Storefront. All rights reserved.</p>
      </div>
    </footer>
  );
}
