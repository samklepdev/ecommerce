import type { CSSProperties } from 'react';

import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: number;
  /** What's loading. Announced to assistive tech, which otherwise hears
   * only that something is busy. */
  label?: string;
}

export function Spinner({ size = 16, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      className={styles.spinner}
      style={{ width: size, height: size } as CSSProperties}
      role="status"
      aria-label={label}
    />
  );
}
