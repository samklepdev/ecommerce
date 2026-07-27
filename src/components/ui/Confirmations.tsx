import { cx } from './cx';
import styles from './Confirmations.module.css';

interface ConfirmationsProps {
  confirmations: number;
  /** `BTC_REQUIRED_CONFIRMATIONS` for this deployment — never a hardcoded
   * 6. What counts as settled is a configuration decision. */
  target: number;
}

/**
 * Confirmation depth as filled pips plus a word for the state.
 *
 * Three states an admin cares about, and they're different kinds of thing:
 * nothing seen on-chain yet, seen but still shallow, and past the threshold
 * this store settles at.
 */
export function Confirmations({ confirmations, target }: ConfirmationsProps) {
  const settled = confirmations >= target;
  const pending = confirmations === 0;
  const label = pending ? 'in mempool' : settled ? 'settled' : `${confirmations}/${target}`;

  return (
    <span className={cx(styles.confs, settled && styles.settled, pending && styles.pending)}>
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: target }, (_, i) => (
          <i key={i} className={i < confirmations ? styles.on : undefined} />
        ))}
      </span>
      <span className={styles.text}>{label}</span>
    </span>
  );
}
