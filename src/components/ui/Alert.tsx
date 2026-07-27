import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './Alert.module.css';

/** `neutral` is the informational tone; the name is kept because 44 call
 * sites already use it. */
export type AlertTone = 'danger' | 'success' | 'warning' | 'neutral';

interface AlertProps {
  children: ReactNode;
  tone?: AlertTone;
  /** Bold first line. Without it the alert is a single sentence, as before. */
  title?: string;
  /** A control on the right — usually the fix for what the alert reports. */
  action?: ReactNode;
  className?: string;
}

const MARKS: Record<AlertTone, string> = {
  danger: '!',
  warning: '▲',
  success: '✓',
  neutral: 'i',
};

export function Alert({ children, tone = 'danger', title, action, className }: AlertProps) {
  return (
    <div
      className={cx(styles.alert, styles[tone], className)}
      // Only danger interrupts a screen reader; the rest are announced when
      // the user next reaches them.
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <span className={styles.mark} aria-hidden="true">
        {MARKS[tone]}
      </span>
      <div className={styles.body}>
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
