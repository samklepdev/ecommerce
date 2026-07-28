import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { paymentStatusTone, fulfillmentStatusTone } from '@/app/lib/status-tone';
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
  searchParams: Promise<{ email?: string; page?: string }>;
}

function buildHref(email: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : '/admin/orders';
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  await requireAdmin();
  const { email, page: pageParam } = await searchParams;

  const { listAllOrdersForAdmin } = getContainer();
  const { items: pagedOrders, page, totalPages, totalItems } = await listAllOrdersForAdmin.execute({
    email,
    page: parsePage(pageParam),
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <div className={styles.page}>
      <Stack gap={5}>
        <h1>Orders</h1>

        <form className={styles.searchForm}>
          <Input type="text" name="email" defaultValue={email} placeholder="Search by customer email" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {email && (
            <Link href="/admin/orders">
              <Button type="button" variant="ghost">
                Clear
              </Button>
            </Link>
          )}
        </form>

        {totalItems === 0 ? (
          <p className={styles.empty}>{email ? 'No orders from that email.' : 'No orders yet.'}</p>
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

        <Pagination page={page} totalPages={totalPages} buildHref={(p) => buildHref(email, p)} />
      </Stack>
    </div>
  );
}
