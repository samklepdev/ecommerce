import styles from './Choice.module.css';

export interface RadioOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface RadioGroupProps<T extends string> {
  name: string;
  value: T;
  onChange: (next: T) => void;
  options: RadioOption<T>[];
  /** Names the whole group for assistive tech — a set of radios without one
   * reads as unrelated controls. */
  legend?: string;
}

export function RadioGroup<T extends string>({
  name,
  value,
  onChange,
  options,
  legend,
}: RadioGroupProps<T>) {
  return (
    <fieldset className={styles.group}>
      {legend && <legend className={styles.legend}>{legend}</legend>}
      {options.map((option) => (
        <div className={styles.choice} key={option.value}>
          <input
            type="radio"
            id={`${name}-${option.value}`}
            name={name}
            className={styles.radio}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <label htmlFor={`${name}-${option.value}`}>
            <span className={styles.label}>{option.label}</span>
            {option.description && (
              <span className={styles.description}>{option.description}</span>
            )}
          </label>
        </div>
      ))}
    </fieldset>
  );
}
