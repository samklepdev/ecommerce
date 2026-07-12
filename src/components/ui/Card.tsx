import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <div className={cx(styles.card, className)}>{children}</div>;
}
