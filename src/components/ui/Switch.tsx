'use client';

import { useId } from 'react';

import { cx } from './cx';
import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

/**
 * A binary setting that takes effect immediately.
 *
 * `role="switch"` rather than a checkbox: a checkbox says "this will be
 * submitted", a switch says "this is on now". Use `Checkbox` inside a form.
 */
export function Switch({ checked, onChange, label }: SwitchProps) {
  const id = useId();

  return (
    <div className={styles.row}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        className={cx(styles.switch, checked && styles.on)}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
    </div>
  );
}
