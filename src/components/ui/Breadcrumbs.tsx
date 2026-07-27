import { Fragment } from 'react';
import Link from 'next/link';

import styles from './Breadcrumbs.module.css';

export interface Crumb {
  label: string;
  /** Omit on the last crumb — you don't link to where you already are. */
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          {i > 0 && (
            <span className={styles.sep} aria-hidden="true">
              /
            </span>
          )}
          {item.href ? (
            <Link href={item.href}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
