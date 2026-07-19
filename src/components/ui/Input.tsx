import type {
  InputHTMLAttributes,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

import { cx } from './cx';
import styles from './Input.module.css';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function Input({ className, ref, ...props }: InputProps) {
  return <input ref={ref} className={cx(styles.input, className)} {...props} />;
}

export function Select({ className, ref, ...props }: SelectProps) {
  return <select ref={ref} className={cx(styles.input, className)} {...props} />;
}

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return <textarea ref={ref} className={cx(styles.input, className)} {...props} />;
}
