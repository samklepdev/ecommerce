import type { ReactNode } from 'react';

import { MenuIcon } from './icons';
import styles from './AdminTopbar.module.css';

interface AdminTopbarProps {
  onOpenNav: () => void;
  accountMenu: ReactNode;
}

/** Utility bar: the nav toggle on small screens and the account menu.
 *
 * Deliberately doesn't repeat the page title — every admin page renders its
 * own `<h1>` right below, and two titles stacked would be one heading too
 * many for a screen reader to work through. */
export function AdminTopbar({ onOpenNav, accountMenu }: AdminTopbarProps) {
  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.menu} onClick={onOpenNav} aria-label="Open menu">
        <MenuIcon className={styles.menuIcon} />
      </button>

      <div className={styles.spacer} />

      <div className={styles.account}>{accountMenu}</div>
    </header>
  );
}
