import Link from 'next/link';

import { cx } from './cx';
import styles from './Pagination.module.css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a given 1-indexed page number — lets each caller
   * decide how to preserve its own query params (filters, etc). */
  buildHref: (page: number) => string;
}

const WINDOW = 1;

function pageNumbers(page: number, totalPages: number): (number | 'ellipsis')[] {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - WINDOW; p <= page + WINDOW; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) result.push('ellipsis');
    result.push(sorted[i]!);
  }
  return result;
}

/** Generic page-link row: Prev / numbered pages (windowed, with ellipses) /
 * Next. Pure server-renderable — no client state, just `<Link>`s — so it
 * drops into any list page without extra wiring. Renders nothing for a
 * single page. */
export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null;

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav className={styles.nav} aria-label="Pagination">
      {isFirst ? (
        <span className={cx(styles.link, styles.disabled)} aria-disabled="true">
          ← Prev
        </span>
      ) : (
        <Link href={buildHref(page - 1)} className={styles.link}>
          ← Prev
        </Link>
      )}

      {pageNumbers(page, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className={styles.ellipsis}>
            …
          </span>
        ) : p === page ? (
          <span key={p} aria-current="page" className={cx(styles.link, styles.active)}>
            {p}
          </span>
        ) : (
          <Link key={p} href={buildHref(p)} className={styles.link}>
            {p}
          </Link>
        ),
      )}

      {isLast ? (
        <span className={cx(styles.link, styles.disabled)} aria-disabled="true">
          Next →
        </span>
      ) : (
        <Link href={buildHref(page + 1)} className={styles.link}>
          Next →
        </Link>
      )}
    </nav>
  );
}
