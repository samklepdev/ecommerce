import type { ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import { formatCount } from '../format';
import styles from './RankedList.module.css';

export interface RankedListProps {
  title: string;
  items: ValueCount[];
  /** What the counts are counting, e.g. "views" — shown once at the foot
   * rather than repeated on every row. */
  unit: string;
}

/** A top-N list where each row's bar is its share of the leader.
 *
 * The bar is the ranking: it makes "the top page is twice the second" a
 * thing you see rather than something you compute from two numbers. */
export function RankedList({ title, items, unit }: RankedListProps) {
  if (items.length === 0) {
    return (
      <section className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.empty}>Nothing recorded in this range yet.</p>
      </section>
    );
  }

  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <section className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <ul className={styles.ranked}>
        {items.map((item) => (
          <li key={item.value}>
            <span className={styles.bar} style={{ width: `${(item.count / max) * 100}%` }} />
            <span className={styles.label} title={item.value}>
              {item.value}
            </span>
            <span className={styles.count}>{formatCount(item.count)}</span>
          </li>
        ))}
      </ul>
      <span className={styles.foot}>{unit}</span>
    </section>
  );
}
