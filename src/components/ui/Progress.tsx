import styles from './Progress.module.css';

interface ProgressProps {
  value: number;
  max?: number;
  /** Shown above the bar with the percentage. Omit for a bare track. */
  label?: string;
}

/** A determinate progress bar. Amber, because the thing this app most often
 * tracks progress of is an on-chain confirmation. */
export function Progress({ value, max = 100, label }: ProgressProps) {
  // Clamped both ways: a negative or overshooting value would otherwise
  // render a bar wider than its track.
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={styles.wrap}>
      {label && (
        <div className={styles.head}>
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
