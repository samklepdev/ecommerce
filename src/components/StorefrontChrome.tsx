import type { ReactNode } from 'react';

import { Header } from './Header';
import { Footer } from './Footer';
import styles from './StorefrontChrome.module.css';

/**
 * Header, footer, and the palette they share with the pages between them.
 *
 * The catalog and product pages each carried their own dark scope, so a
 * light header sat above a dark page. Declaring the palette once here means
 * the chrome and the content can't disagree — and a page no longer has to
 * opt in to look right.
 */
export function StorefrontChrome({ children }: { children: ReactNode }) {
  return (
    <div className={styles.storefront}>
      <Header />
      {children}
      <Footer />
    </div>
  );
}
