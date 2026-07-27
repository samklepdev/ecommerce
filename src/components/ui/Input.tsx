import type { ReactNode } from 'react';
import type {
  InputHTMLAttributes,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

import { cx } from './cx';
import styles from './Input.module.css';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
  ref?: Ref<HTMLInputElement>;
  /** Static text before the field — a currency symbol, a scheme. */
  prefix?: ReactNode;
  /** Static text after it — a unit, a domain. */
  suffix?: ReactNode;
};
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function Input({ className, prefix, suffix, ref, ...props }: InputProps) {
  // Without an affix the input is exactly what it always was — a bare
  // element callers can size and place themselves.
  if (!prefix && !suffix) {
    return <input ref={ref} className={cx(styles.input, className)} {...props} />;
  }

  return (
    <div className={cx(styles.affixWrap, className)}>
      {prefix && <span className={styles.affix}>{prefix}</span>}
      <input ref={ref} className={cx(styles.input, styles.bare)} {...props} />
      {suffix && <span className={styles.affix}>{suffix}</span>}
    </div>
  );
}

export function Select({ className, ref, ...props }: SelectProps) {
  return <select ref={ref} className={cx(styles.input, className)} {...props} />;
}

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return <textarea ref={ref} className={cx(styles.input, className)} {...props} />;
}
