import type { ButtonHTMLAttributes } from 'react';

import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Square padding for an icon-only button (no visible text label) —
   * always pair with an aria-label on the button itself. */
  iconOnly?: boolean;
}

export function Button({ variant = 'primary', iconOnly = false, className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(styles.button, styles[variant], iconOnly && styles.iconOnly, className)}
      {...props}
    />
  );
}
