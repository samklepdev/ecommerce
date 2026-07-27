import type { PathDwell } from '@/modules/analytics/application/ports/analytics-event-repository';
import { formatCount, formatDuration } from '../format';
import styles from './RankedList.module.css';

export interface DwellListProps {
  items: PathDwell[];
}

/** Mean time on page, per path.
 *
 * The bar is scaled against the longest dwell in the set, and the sample
 * count rides along on every row: a four-minute mean over two visits is a
 * very different claim from one over two thousand, and a bar alone hides
 * that difference. */
export function DwellList({ items }: DwellListProps) {
  if (items.length === 0) {
    return (
      <section className={styles.card}>
        <h3 className={styles.title}>Time on page</h3>
        <p className={styles.empty}>
          Nothing recorded yet — this fills in as visitors browse.
        </p>
      </section>
    );
  }

  const max = Math.max(...items.map((i) => i.meanMs), 1);

  return (
    <section className={styles.card}>
      <h3 className={styles.title}>Time on page</h3>
      <ul className={styles.ranked}>
        {items.map((item) => (
          <li key={item.path}>
            <span className={styles.bar} style={{ width: `${(item.meanMs / max) * 100}%` }} />
            <span className={styles.label} title={item.path}>
              {item.path}
            </span>
            <span className={styles.count} title={`${formatCount(item.samples)} exits recorded`}>
              {formatDuration(item.meanMs)}
            </span>
          </li>
        ))}
      </ul>
      <span className={styles.foot}>mean, per visit</span>
    </section>
  );
}
