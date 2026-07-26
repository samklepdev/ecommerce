import type { ReactNode } from 'react';

import styles from './ChartCard.module.css';

export interface ChartCardProps {
  title: string;
  children: ReactNode;
}

/** An elevated panel holding one chart or table, with its heading.
 *
 * Renders its own surface rather than wrapping the shared `Card`: `Card` uses
 * --color-surface, which is also `StatCard`'s background, so reusing it left
 * every panel on the page the same flat grey. */
export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <section className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {children}
    </section>
  );
}
