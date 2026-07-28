import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './Badge.module.css';

/** `sats` is filled rather than outlined — it marks a bitcoin-denominated
 * value, which is the one thing amber means across the whole app.
 *
 * `info` / `violet` / `slate` / `dangerSoft` exist so a set of related
 * states can be told apart rather than collapsing into green-amber-red-grey
 * — see `status-tone.ts`, where eight payment states share one column. */
export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'dangerSoft'
  | 'info'
  | 'violet'
  | 'slate'
  | 'sats';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return <span className={cx(styles.badge, styles[tone], className)}>{children}</span>;
}
