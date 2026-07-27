import { CopyButton } from './CopyButton';
import styles from './Address.module.css';

interface AddressProps {
  value: string;
  /** Characters kept at the head. The tail is always 6, because the
   * checksum end is what people actually verify against. */
  chars?: number;
  /** Block-explorer URL, when there's one worth linking. */
  explorer?: string;
}

/**
 * A bitcoin address, truncated at both ends.
 *
 * Copy is built in rather than optional: an address that can't be copied
 * cleanly is a support ticket, and a hand-retyped one is a lost payment.
 * The full value stays available as the title and to the clipboard.
 */
export function Address({ value, chars = 8, explorer }: AddressProps) {
  const short =
    value.length > chars + 9 ? `${value.slice(0, chars)}…${value.slice(-6)}` : value;

  return (
    <span className={styles.address}>
      <span className={styles.text} title={value}>
        {short}
      </span>
      <CopyButton value={value} label="address" />
      {explorer && (
        <a
          className={styles.link}
          href={explorer}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open in block explorer"
        >
          ↗
        </a>
      )}
    </span>
  );
}
