import styles from './ConfirmationPips.module.css';

export interface ConfirmationPipsProps {
  confirmations: number;
  /** `BTC_REQUIRED_CONFIRMATIONS` — the threshold this deployment actually
   * settles at, not a hardcoded 6. */
  required: number;
}

/** Confirmation depth as filled pips plus a word for the state.
 *
 * Three states an admin cares about, and they're different kinds of thing:
 * nothing seen on-chain yet, seen but still shallow, and past the threshold
 * this store settles at. */
export function ConfirmationPips({ confirmations, required }: ConfirmationPipsProps) {
  const settled = confirmations >= required;
  const pending = confirmations === 0;

  const label = pending ? 'in mempool' : settled ? 'settled' : `${confirmations}/${required}`;

  return (
    <span
      className={`${styles.confs} ${settled ? styles.settled : ''} ${pending ? styles.pending : ''}`}
    >
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: required }, (_, i) => (
          <i key={i} className={i < confirmations ? `${styles.pip} ${styles.on}` : styles.pip} />
        ))}
      </span>
      <span className={styles.text}>{label}</span>
    </span>
  );
}
