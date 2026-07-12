import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './Alert.module.css';

export type AlertTone = 'danger' | 'success' | 'neutral';

interface AlertProps {
  children: ReactNode;
  tone?: AlertTone;
}

export function Alert({ children, tone = 'danger' }: AlertProps) {
  return (
    <p className={cx(styles.alert, styles[tone])} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
