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

/**
 * `sm` is the default and is deliberately tight — most badges here sit in dense
 * admin tables where compactness is the point. `md` is for the few places a
 * badge is the primary thing on the screen rather than a cell in a grid, such
 * as an order's status on the customer's own order page, where the label is a
 * short sentence and needs room to read as one.
 */
export type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  className?: string;
}

export function Badge({ children, tone = 'neutral', size = 'sm', className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], size === 'md' && styles.md, className)}>
      {children}
    </span>
  );
}
