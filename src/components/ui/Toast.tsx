'use client';

import { useEffect } from 'react';

import { cx } from './cx';
import styles from './Toast.module.css';

export interface ToastProps {
  message: string;
  tone: 'success' | 'danger';
  onDismiss: () => void;
  durationMs?: number;
}

export function Toast({ message, tone, onDismiss, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div className={cx(styles.toast, styles[tone])} role={tone === 'danger' ? 'alert' : 'status'}>
      {message}
    </div>
  );
}
