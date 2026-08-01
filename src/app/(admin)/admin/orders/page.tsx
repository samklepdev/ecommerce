import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { paymentStatusTone, fulfillmentStatusTone } from '@/app/lib/status-tone';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';
import { Money } from '@/shared/domain/money';
import { Stack } from '@/components/ui/Stack';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { parsePage, DEFAULT_PAGE_SIZE } from '@/components/ui/paginate';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminOrdersPageProps {
  searchParams: Promise<{
    email?: string;
    page?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    recovered?: string;
    latePayment?: string;
  }>;
}

/**
 * Validated, not cast. These reach a SQL `WHERE` clause, and an arbitrary
 * query-string value has no business getting that far — an unrecognised
 * status becomes "no filter" rather than an error page or a query that
 * matches nothing for reasons the admin can't see.
 */
const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'awaiting_payment',
  'awaiting_confirmation',
  'paid',
  'failed',
  'expired',
  'cancelled',
];

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'unfulfilled',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

function parsePaymentStatus(value: string | undefined): PaymentStatus | undefined {
  return PAYMENT_STATUSES.find((s) => s === value);
}

function parseFulfillmentStatus(value: string | undefined): FulfillmentStatus | undefined {
  return FULFILLMENT_STATUSES.find((s) => s === value);
}

interface OrderFilters {
  email?: string;
  paymentStatus?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  recovered?: boolean;
  latePayment?: boolean;
}

/** Carries every active filter through pagination — a page 2 link that
 * dropped the filter would silently show a different set of orders. */
function buildHref(filters: OrderFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.email) params.set('email', filters.email);
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
  if (filters.fulfillmentStatus) params.set('fulfillmentStatus', filters.fulfillmentStatus);
  if (filters.recovered) params.set('recovered', '1');
  if (filters.latePayment) params.set('latePayment', '1');
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : '/admin/orders';
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const { email, page: pageParam } = params;
  const filters: OrderFilters = {
    email,
    paymentStatus: parsePaymentStatus(params.paymentStatus),
    fulfillmentStatus: parseFulfillmentStatus(params.fulfillmentStatus),
    recovered: params.recovered === '1',
    latePayment: params.latePayment === '1',
  };
  const isFiltered = Boolean(
    filters.email ||
      filters.paymentStatus ||
      filters.fulfillmentStatus ||
      filters.recovered ||
      filters.latePayment,
  );

  const { listAllOrdersForAdmin } = getContainer();
  const { items: pagedOrders, page, totalPages, totalItems } = await listAllOrdersForAdmin.execute({
    ...filters,
    page: parsePage(pageParam),
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <div className={styles.page}>
      <Stack gap={5}>
        <h1>Orders</h1>

        {/* One GET form for every filter, so they compose: "paid orders for
            this customer" is a question the dashboard tiles can't ask on
            their own but an admin chasing a specific problem needs. The
            boolean filters ride along as hidden inputs when set, so
            submitting the form doesn't silently drop the tile that got you
            here. */}
        <form className={styles.searchForm}>
          <Input type="text" name="email" defaultValue={email} placeholder="Search by customer email" />
          <select
            name="paymentStatus"
            defaultValue={filters.paymentStatus ?? ''}
            className={styles.filterSelect}
            aria-label="Filter by payment status"
          >
            <option value="">Any payment status</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            name="fulfillmentStatus"
            defaultValue={filters.fulfillmentStatus ?? ''}
            className={styles.filterSelect}
            aria-label="Filter by fulfillment status"
          >
            <option value="">Any fulfillment status</option>
            {FULFILLMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {filters.recovered && <input type="hidden" name="recovered" value="1" />}
          {filters.latePayment && <input type="hidden" name="latePayment" value="1" />}
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {isFiltered && (
            <Link href="/admin/orders">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          )}
        </form>

        {/* Named in words, because a tile's count only means something if the
            list you land on is the one it counted. */}
        {(filters.recovered || filters.latePayment) && (
          <p className={styles.filterNote}>
            {filters.latePayment
              ? 'Showing orders holding Bitcoin that arrived after they closed.'
              : 'Showing orders whose payment landed after they had expired or been cancelled.'}
          </p>
        )}

        {totalItems === 0 ? (
          <p className={styles.empty}>
            {isFiltered ? 'No orders match those filters.' : 'No orders yet.'}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Placed</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className={styles.cellLink}>
                        {order.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className={styles.cellLink}>
                        {order.customerEmail}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className={styles.cellLink}>
                        {order.createdAt.toLocaleDateString()}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className={styles.cellLink}>
                        {Money.of(order.amountMinor, order.currency).toDisplayString()}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className={`${styles.cellLink} ${styles.statusCell}`}
                      >
                        <Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                        {order.paymentRecoveredFrom && <Badge tone="warning">Recovered</Badge>}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className={`${styles.cellLink} ${styles.statusCell}`}
                      >
                        <Badge tone={fulfillmentStatusTone(order.fulfillmentStatus)}>
                          {order.fulfillmentStatus}
                        </Badge>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} buildHref={(p) => buildHref(filters, p)} />
      </Stack>
    </div>
  );
}
