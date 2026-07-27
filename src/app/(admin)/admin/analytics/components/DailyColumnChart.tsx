import { formatCount, shortDay } from '../format';
import styles from './DailyColumnChart.module.css';

export type ColumnTone = 'accent' | 'amber';

export interface DailyColumnChartProps {
  /** Gap-filled: one entry per calendar day in the range. */
  points: { day: string; value: number }[];
  tone?: ColumnTone;
  /** Trailing half of the axis's middle label, e.g. "sats peak". */
  peakSuffix: string;
  emptyLabel: string;
}

/** A daily series as plain CSS columns.
 *
 * No hover layer and no JS — each column carries its own title, so the
 * figures are reachable without a tooltip that has to be positioned,
 * dismissed, and kept off the data. */
export function DailyColumnChart({
  points,
  tone = 'accent',
  peakSuffix,
  emptyLabel,
}: DailyColumnChartProps) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return <p className={styles.empty}>{emptyLabel}</p>;

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <>
      <div className={`${styles.chart} ${styles[tone]}`}>
        {points.map((p) => (
          <div
            key={p.day}
            className={styles.col}
            title={`${shortDay(p.day)} · ${formatCount(p.value)}`}
          >
            <span style={{ height: `${(p.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className={styles.axis}>
        <span>{shortDay(first.day)}</span>
        <span>
          {formatCount(max)} {peakSuffix}
        </span>
        <span>{shortDay(last.day)}</span>
      </div>
    </>
  );
}
