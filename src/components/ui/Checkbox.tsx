import { useId, type InputHTMLAttributes } from 'react';

import styles from './Choice.module.css';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  /** Secondary line under the label — the consequence of ticking it. */
  description?: string;
}

export function Checkbox({ label, description, ...rest }: CheckboxProps) {
  const id = useId();

  return (
    <div className={styles.choice}>
      <input type="checkbox" id={id} className={styles.checkbox} {...rest} />
      <label htmlFor={id}>
        <span className={styles.label}>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </label>
    </div>
  );
}
