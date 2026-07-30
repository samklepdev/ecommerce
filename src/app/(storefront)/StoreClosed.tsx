import { env } from '@/config/env';
import styles from './StoreClosed.module.css';

/**
 * What every storefront route renders while the kill switch is on.
 *
 * No header, no footer, no navigation — every link in them leads to another
 * copy of this page, and a full set of chrome makes a closed shop look
 * broken rather than closed. The brand mark stays so a visitor can see
 * they're in the right place.
 *
 * The operator's reason is deliberately *not* shown. It's an internal note
 * for the audit log ("supplier outage", "sorting out payments"), and a
 * visitor reading it learns something about the business rather than
 * something about their order.
 *
 * No date, no ETA either — a promise of "back on Tuesday" is a promise the
 * switch can't keep, and stale copy on a closed shop is worse than none.
 */
export function StoreClosed() {
  return (
    <div className={styles.page}>
      <span />

      <div className={styles.panel}>
        <span className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>Storefront</span>
        </span>

        <h1 className={styles.title}>Ordering is paused</h1>

        <p className={styles.body}>
          The shop is temporarily closed and isn&apos;t taking new orders right now. Nothing
          you&apos;ve already ordered is affected — orders already placed are still being
          processed and paid orders will still ship.
        </p>

        <p className={styles.note}>
          Questions about an existing order? Email{' '}
          <a href={`mailto:${env.SUPPORT_EMAIL}`}>{env.SUPPORT_EMAIL}</a>.
        </p>
      </div>

      <span />
    </div>
  );
}
