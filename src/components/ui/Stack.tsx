import type { CSSProperties, ReactNode } from 'react';

import { cx } from './cx';
import styles from './Stack.module.css';

interface StackProps {
  children: ReactNode;
  gap?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}

export function Stack({ children, gap = 4, className }: StackProps) {
  const style = { '--stack-gap': `var(--space-${gap})` } as CSSProperties;
  return (
    <div className={cx(styles.stack, className)} style={style}>
      {children}
    </div>
  );
}
