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
    <StorefrontScope>
      <Header />
      {children}
      <Footer />
    </StorefrontScope>
  );
}

/**
 * The palette on its own, without header or footer.
 *
 * For the pages that shouldn't carry navigation — the closed-store notice —
 * which still need the storefront's colours and, more importantly, the
 * `data-theme-scope` marker that anything portaled resolves against.
 * Rendering those pages bare would fall back to the root palette and look
 * like a different site.
 */
export function StorefrontScope({ children }: { children: ReactNode }) {
  return (
    <div className={styles.storefront} data-theme-scope>
      {children}
    </div>
  );
}
