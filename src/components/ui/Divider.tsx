import styles from './Divider.module.css';

interface DividerProps {
  /** Centred caption, for "or" style separators. Omit for a plain rule. */
  label?: string;
}

export function Divider({ label }: DividerProps) {
  if (!label) return <hr className={styles.divider} />;

  return (
    <div className={styles.labelled}>
      <span>{label}</span>
    </div>
  );
}
