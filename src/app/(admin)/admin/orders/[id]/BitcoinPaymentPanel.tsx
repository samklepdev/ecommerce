import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { Badge } from '@/components/ui/Badge';
import styles from './BitcoinPaymentPanel.module.css';

interface BitcoinPaymentPanelProps {
  address: string;
  expectedSats: number;
  confirmedSats: number;
  pendingSats: number;
  confirmations: number;
  requiredConfirmations: number;
  underpaid: boolean;
  overpaid: boolean;
  /** Non-null when bitcoin arrived after the order closed. */
  latePaymentSats: number | null;
}

/**
 * What the chain says about this order.
 *
 * None of it was visible anywhere in the admin console. `/admin/orders/[id]`
 * rendered the customer's order view with `paymentSession={null}`, and that
 * view gates every Bitcoin field on the prop — so no address, no expected
 * amount, no confirmed amount, no confirmation count and no shortfall, for
 * any order in any state. The only surface carrying these figures was the
 * on-chain analytics page, which filters to `paid`, i.e. exactly the orders
 * nobody needs to investigate.
 *
 * The concrete failure: a customer emails asking how much more to send on an
 * underpaid order, and the admin cannot answer a question the database has
 * already stored the answer to. Meanwhile the 48-hour clock runs out and the
 * order goes terminal.
 *
 * Read-only. The customer's widget polls and offers payment affordances;
 * neither belongs on an admin screen.
 */
export function BitcoinPaymentPanel({
  address,
  expectedSats,
  confirmedSats,
  pendingSats,
  confirmations,
  requiredConfirmations,
  underpaid,
  overpaid,
  latePaymentSats,
}: BitcoinPaymentPanelProps) {
  // Against confirmed *and* pending, matching what the customer is asked for.
  // Quoting an admin a larger balance than the customer's own page shows is
  // how the two end up disagreeing on a call.
  const outstandingSats = Math.max(0, expectedSats - confirmedSats - pendingSats);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Bitcoin payment</h2>
        <div className={styles.flags}>
          {underpaid && <Badge tone="warning">Underpaid</Badge>}
          {overpaid && <Badge tone="warning">Overpaid</Badge>}
          {latePaymentSats !== null && <Badge tone="danger">Late payment</Badge>}
        </div>
      </div>

      <dl className={styles.grid}>
        <div className={styles.field}>
          <dt className={styles.label}>Receiving address</dt>
          {/* Full, and monospace: an admin cross-referencing a block explorer
              needs the whole string, and a truncated one is worse than none. */}
          <dd className={styles.address}>{address}</dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.label}>Expected</dt>
          <dd className={styles.amount}>{satsToBtcString(expectedSats)} BTC</dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.label}>Confirmed</dt>
          <dd className={styles.amount}>{satsToBtcString(confirmedSats)} BTC</dd>
        </div>

        {pendingSats > 0 && (
          <div className={styles.field}>
            <dt className={styles.label}>In the mempool</dt>
            {/* Shown only when there is some: a permanent "0.00000000 BTC
                unconfirmed" row is noise on every settled order. */}
            <dd className={styles.amount}>{satsToBtcString(pendingSats)} BTC</dd>
          </div>
        )}

        {outstandingSats > 0 && (
          <div className={styles.field}>
            <dt className={styles.label}>Still owed</dt>
            {/* The number the customer will ask for by name. */}
            <dd className={`${styles.amount} ${styles.owed}`}>
              {satsToBtcString(outstandingSats)} BTC
            </dd>
          </div>
        )}

        <div className={styles.field}>
          <dt className={styles.label}>Confirmations</dt>
          <dd className={styles.amount}>
            {confirmations} of {requiredConfirmations}
          </dd>
        </div>

        {latePaymentSats !== null && (
          <div className={styles.field}>
            <dt className={styles.label}>Arrived after the order closed</dt>
            <dd className={`${styles.amount} ${styles.owed}`}>
              {satsToBtcString(latePaymentSats)} BTC
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
