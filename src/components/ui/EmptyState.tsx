import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  /** What isn't here — stated plainly, not apologetically. */
  title: string;
  /** Why it's empty, or what to do about it. An empty screen is an
   * invitation to act, not a dead end. */
  description?: string;
  action?: ReactNode;
  /** For empties inside a card or column rather than a whole page. */
  compact?: boolean;
}

export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, compact && styles.compact)}>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.body}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
