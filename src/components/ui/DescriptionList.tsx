import type { CSSProperties, ReactNode } from 'react';

import styles from './DescriptionList.module.css';

export interface DescriptionItem {
  term: string;
  value: ReactNode;
}

interface DescriptionListProps {
  items: DescriptionItem[];
  columns?: 1 | 2 | 3;
}

/** Term/value pairs — order summaries, payment details, anywhere you'd
 * otherwise reach for a two-column table that isn't tabular data. */
export function DescriptionList({ items, columns = 1 }: DescriptionListProps) {
  const style = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } as CSSProperties;

  return (
    <dl className={styles.dl} style={style}>
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
