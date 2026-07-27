import Link from 'next/link';

import type { OrderListItem } from '@/modules/orders/application/ports/order-history-repository';
import { formatCount, formatRangeDate } from './analytics/format';
import { DailyColumnChart } from './analytics/components/DailyColumnChart';
import styles from './page.module.css';

export interface AttentionQueue {
  label: string;
  count: number;
  href: string;
  /** What to do about it — a count alone doesn't say whether it's a problem
   * or just a number. */
  hint: string;
}

export interface OrderRow {
  id: string;
  customerEmail: string;
  placed: string;
  amountLabel: string;
  paymentStatus: OrderListItem['paymentStatus'];
  fulfillmentStatus: OrderListItem['fulfillmentStatus'];
}

export interface AdminOverviewProps {
  since: Date;
  until: Date;
  windowDays: number;

  /** Work waiting on a human, most urgent first. */
  queues: AttentionQueue[];

  revenueLabel: string;
  ordersCount: number;
  itemsSold: number;
  pageViews: number;

  revenuePerDay: { day: string; value: number }[];
  recentOrders: OrderRow[];
}

/** Maps a payment or fulfilment status onto one of four tones. The `?? ''`
 * is for `noUncheckedIndexedAccess`, which types CSS-module lookups as
 * possibly undefined. */
function statusClass(status: string): string {
  if (status === 'paid' || status === 'delivered' || status === 'shipped') return styles.ok ?? '';
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return styles.bad ?? '';
  if (status === 'awaiting_confirmation' || status === 'processing') return styles.working ?? '';
  return styles.neutral ?? '';
}

/**
 * The admin index as a pure function of already-fetched data.
 *
 * Ordered by what an admin does when they open it: first what needs a
 * decision, then how the store is doing, then the most recent orders. The
 * headline figures come second because a number you can't act on is not the
 * reason you opened the page.
 */
export function AdminOverview({
  since,
  until,
  windowDays,
  queues,
  revenueLabel,
  ordersCount,
  itemsSold,
  pageViews,
  revenuePerDay,
  recentOrders,
}: AdminOverviewProps) {
  const needsAttention = queues.filter((q) => q.count > 0);

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <h1>Dashboard</h1>
        </div>
        <span className={styles.rangeText}>
          {formatRangeDate(since)} — {formatRangeDate(until)}
        </span>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Needs attention</h2>
          <Link href="/admin/fulfillment">Fulfillment queue →</Link>
        </div>

        {needsAttention.length === 0 ? (
          <p className={styles.allClear}>
            Nothing waiting. Every order is sourced, paid and moving.
          </p>
        ) : (
          <div className={styles.queues}>
            {needsAttention.map((queue) => (
              <Link key={queue.label} href={queue.href} className={styles.queue}>
                <span className={styles.queueCount}>{formatCount(queue.count)}</span>
                <span className={styles.queueLabel}>{queue.label}</span>
                <span className={styles.queueHint}>{queue.hint}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Last {windowDays} days</h2>
          <Link href="/admin/analytics">Analytics →</Link>
        </div>

        <div className={styles.card}>
          <dl className={styles.stats}>
            <div>
              <dt>Revenue booked</dt>
              <dd>{revenueLabel}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{formatCount(ordersCount)}</dd>
            </div>
            <div>
              <dt>Items sold</dt>
              <dd>{formatCount(itemsSold)}</dd>
            </div>
            <div>
              <dt>Page views</dt>
              <dd>{formatCount(pageViews)}</dd>
            </div>
          </dl>

          <DailyColumnChart
            points={revenuePerDay}
            peakSuffix="peak day"
            emptyLabel="No revenue booked in this range."
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Recent orders</h2>
          <Link href="/admin/orders">All orders →</Link>
        </div>

        <div className={styles.card}>
          {recentOrders.length === 0 ? (
            <p className={styles.empty}>No orders yet.</p>
          ) : (
            <table className={styles.orders}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Placed</th>
                  <th className={styles.rt}>Total</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td data-label="Order">
                      <Link className={styles.orderLink} href={`/admin/orders/${order.id}`}>
                        {order.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td data-label="Customer" className={styles.email} title={order.customerEmail}>
                      {order.customerEmail}
                    </td>
                    <td data-label="Placed" className={styles.muted}>
                      {order.placed}
                    </td>
                    <td data-label="Total" className={`${styles.rt} ${styles.amount}`}>
                      {order.amountLabel}
                    </td>
                    <td data-label="Payment">
                      <span className={`${styles.pill} ${statusClass(order.paymentStatus)}`}>
                        {order.paymentStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td data-label="Fulfillment">
                      <span className={`${styles.pill} ${statusClass(order.fulfillmentStatus)}`}>
                        {order.fulfillmentStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
