import type { ReactNode } from 'react';

import styles from './Tooltip.module.css';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

/**
 * A short hint on hover or focus.
 *
 * `tabIndex={0}` so it's reachable by keyboard — a tooltip that only
 * appears on hover is invisible to anyone not using a pointer. Keep the
 * content non-essential: this is CSS-only, so it can't be read by a screen
 * reader that isn't focusing the trigger.
 */
export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className={styles.wrap} tabIndex={0}>
      {children}
      <span className={styles.tip} role="tooltip">
        {content}
      </span>
    </span>
  );
}
