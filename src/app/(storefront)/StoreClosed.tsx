import styles from './StoreClosed.module.css';

/**
 * What every storefront route renders while the kill switch is on: the mark
 * from the paused notice, centred, and nothing else.
 *
 * No message, no reason, no ETA, no navigation. Anything written here is
 * either a promise the switch can't keep ("back on Tuesday") or an
 * explanation nobody asked for — and the closure reason in particular is an
 * internal note for the audit log, not something a customer should read. A
 * page that says nothing says only that the shop isn't open.
 *
 * The document still carries a title ("Storefront", from the root layout),
 * so the tab is named and a screen reader announces something on load even
 * though the body is a single decorative mark.
 */
export function StoreClosed() {
  return (
    <div className={styles.page}>
      <span className={styles.mark} aria-hidden="true">
        ●
      </span>
    </div>
  );
}
