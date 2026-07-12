import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';

import { cx } from './cx';
import styles from './Input.module.css';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(styles.input, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(styles.input, className)} {...props} />;
}
