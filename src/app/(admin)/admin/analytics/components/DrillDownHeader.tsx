import Link from 'next/link';

import { formatRangeDate } from '../format';
import { RangePresets } from './RangePresets';
import styles from './DrillDownHeader.module.css';

export interface DrillDownHeaderProps {
  title: string;
  since: Date;
  until: Date;
  /** This page's own path, so the presets keep you where you are. */
  basePath: string;
  /** CSV endpoint for the same window. */
  exportHref: string;
}

/** Shared masthead for every analytics drill-down: where you are, how to get
 * back, the range control, and the export for exactly that range. */
export function DrillDownHeader({
  title,
  since,
  until,
  basePath,
  exportHref,
}: DrillDownHeaderProps) {
  return (
    <header className={styles.head}>
      <div>
        <Link href="/admin/analytics" className={styles.back}>
          ← Analytics
        </Link>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.controls}>
        <RangePresets since={since} until={until} basePath={basePath} />
        <span className={styles.rangeText}>
          {formatRangeDate(since)} — {formatRangeDate(until)}
        </span>
        <a href={exportHref} className={styles.export}>
          Export CSV
        </a>
      </div>
    </header>
  );
}
