import Link from 'next/link';

import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { OnChainOrderActivity } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import { Address } from '@/components/ui/Address';
import { Confirmations } from '@/components/ui/Confirmations';
import styles from './PaidOrdersLedger.module.css';

export interface PaidOrdersLedgerProps {
  orders: OnChainOrderActivity[];
  requiredConfirmations: number;
}

export function PaidOrdersLedger({ orders, requiredConfirmations }: PaidOrdersLedgerProps) {
  if (orders.length === 0) {
    return <p className={styles.empty}>No paid orders in this range.</p>;
  }

  return (
    <table className={styles.ledger}>
      <thead>
        <tr>
          <th>Order</th>
          <th>Receiving address</th>
          <th className={styles.rt}>Amount</th>
          <th>Confirmations</th>
          <th className={styles.rt}>Flags</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.orderId} className={o.underpaid || o.overpaid ? styles.flagged : undefined}>
            {/* data-label drives the stacked mobile layout, where the header
                row is hidden and each cell has to name itself. */}
            <td data-label="Order">
              <Link className={styles.orderLink} href={`/admin/orders/${o.orderId}`}>
                {o.orderId.slice(0, 8)}
              </Link>
            </td>
            <td data-label="Address">
              <Address value={o.address} />
            </td>
            <td data-label="Amount" className={`${styles.rt} ${styles.amount}`}>
              {satsToBtcString(o.expectedSats)}
              <span className={styles.unit}> BTC</span>
            </td>
            <td data-label="Confirmations">
              <Confirmations confirmations={o.confirmations} target={requiredConfirmations} />
            </td>
            <td data-label="Flags" className={styles.rt}>
              {o.underpaid && <span className={`${styles.tag} ${styles.danger}`}>Underpaid</span>}
              {o.overpaid && <span className={`${styles.tag} ${styles.warn}`}>Overpaid</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
