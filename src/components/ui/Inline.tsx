import type { CSSProperties, ReactNode } from 'react';

import { cx } from './cx';
import styles from './Inline.module.css';

interface InlineProps {
  children: ReactNode;
  /** Multiples of 4px, matching `Stack`. */
  gap?: 1 | 2 | 3 | 4 | 5 | 6;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  /** Wraps by default: most horizontal groups should reflow on a narrow
   * screen rather than overflow it. */
  wrap?: boolean;
  className?: string;
}

/** The horizontal counterpart to `Stack`. */
export function Inline({
  children,
  gap = 3,
  align = 'center',
  justify = 'flex-start',
  wrap = true,
  className,
}: InlineProps) {
  const style = {
    gap: `var(--space-${gap})`,
    alignItems: align,
    justifyContent: justify,
    flexWrap: wrap ? 'wrap' : 'nowrap',
  } as CSSProperties;

  return (
    <div className={cx(styles.inline, className)} style={style}>
      {children}
    </div>
  );
}
