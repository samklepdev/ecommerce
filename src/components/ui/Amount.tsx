import { cx } from './cx';
import styles from './Amount.module.css';

export type AmountSize = 'sm' | 'md' | 'lg';

interface AmountProps {
  /** Pre-formatted fiat, e.g. "$157.94". Formatting stays with the caller,
   * which has the `Money` object and its currency. */
  fiat: string;
  /** Pre-formatted crypto, e.g. "166,252 sats" or "0.00157001 BTC". Omit
   * when the rate feed was unreachable — the component then shows fiat
   * alone rather than a stale conversion. */
  sats?: string | null;
  size?: AmountSize;
  align?: 'start' | 'end';
}

/**
 * Every price, total and line item in the app.
 *
 * Owns one rule so it lives in exactly one place: **fiat is neutral and
 * primary, sats are amber and secondary.** Amber means "denominated in
 * bitcoin" everywhere — the same reason the star ratings are monochrome.
 */
export function Amount({ fiat, sats, size = 'md', align = 'start' }: AmountProps) {
  return (
    <span className={cx(styles.amount, styles[size], align === 'end' && styles.end)}>
      <span className={styles.fiat}>{fiat}</span>
      {sats && <span className={styles.sats}>{sats}</span>}
    </span>
  );
}
