import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './StatusDot.module.css';

export type StatusTone = 'neutral' | 'accent' | 'warning' | 'danger';

interface StatusDotProps {
  tone?: StatusTone;
  children: ReactNode;
}

/** Lifecycle state: the dot carries it at a glance, the word confirms it.
 * Colour alone would fail anyone who can't distinguish it. */
export function StatusDot({ tone = 'neutral', children }: StatusDotProps) {
  return (
    <span className={cx(styles.status, styles[tone])}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
