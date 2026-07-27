import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './Badge.module.css';

/** `sats` is filled rather than outlined — it marks a bitcoin-denominated
 * value, which is the one thing amber means across the whole app. */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'sats';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return <span className={cx(styles.badge, styles[tone], className)}>{children}</span>;
}
