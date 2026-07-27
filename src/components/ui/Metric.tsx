import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './Metric.module.css';

interface MetricProps {
  label: string;
  /** Pre-formatted — the caller owns currency, locale and rounding. */
  value: ReactNode;
  /** Percentage change. `null` means there was no baseline to compare
   * against, which is different from zero change and renders as nothing. */
  delta?: number | null;
  /** What the delta is measured against, e.g. "vs previous 30 days". */
  note?: string;
}

/** One headline figure. */
export function Metric({ label, value, delta, note }: MetricProps) {
  return (
    <div className={styles.metric}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      {delta != null && (
        <span className={cx(styles.delta, delta >= 0 ? styles.up : styles.down)}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
        </span>
      )}
      {note && <span className={styles.note}>{note}</span>}
    </div>
  );
}
