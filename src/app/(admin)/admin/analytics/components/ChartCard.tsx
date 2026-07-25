import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import styles from './ChartCard.module.css';

export interface ChartCardProps {
  title: string;
  children: ReactNode;
}

/** Wraps a chart in the `Card` + title treatment previously copy-pasted as
 * `<Card className={styles.chartCard}><h3 className={styles.cardTitle}>`
 * everywhere a chart appeared. */
export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {children}
    </Card>
  );
}
