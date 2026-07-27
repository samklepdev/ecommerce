import type { ReactNode } from 'react';

import styles from './AdminTopbar.module.css';

interface AdminTopbarProps {
  accountMenu: ReactNode;
}

/** Utility bar: the account menu, and room for whatever joins it.
 *
 * No nav toggle here — the rail is always on screen and carries its own
 * chevron, so a second control up here would be a duplicate.
 *
 * Deliberately doesn't repeat the page title — every admin page renders its
 * own `<h1>` right below, and two titles stacked would be one heading too
 * many for a screen reader to work through. */
export function AdminTopbar({ accountMenu }: AdminTopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.spacer} />

      <div className={styles.account}>{accountMenu}</div>
    </header>
  );
}
