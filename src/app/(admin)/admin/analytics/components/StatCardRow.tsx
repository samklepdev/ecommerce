import type { ReactNode } from 'react';

import styles from './StatCardRow.module.css';

/** Responsive row of `StatCard`s — wraps to multiple rows on narrow
 * viewports instead of overflowing or squeezing. */
export function StatCardRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
