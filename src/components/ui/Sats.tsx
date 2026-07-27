import styles from './Sats.module.css';

interface SatsProps {
  /** Pre-formatted, e.g. "0.00157001 BTC". */
  children: string;
}

/** A bitcoin-denominated figure with no fiat counterpart — an on-chain
 * total, a received amount. Use `Amount` when there is a fiat price too. */
export function Sats({ children }: SatsProps) {
  return <span className={styles.sats}>{children}</span>;
}
