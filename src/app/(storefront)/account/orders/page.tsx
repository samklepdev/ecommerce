import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { paymentStatusTone, fulfillmentStatusTone } from '@/app/lib/status-tone';
import { isOrderCancellable } from '@/modules/orders/domain/order-status';
import { Money } from '@/shared/domain/money';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { paginate, parsePage, DEFAULT_PAGE_SIZE } from '@/components/ui/paginate';
import { cancelOwnOrderAction } from '@/app/actions/orders';
import { CancelOrderButton } from '../../orders/CancelOrderButton';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface OrdersPageProps {
  searchParams: Promise<{ page?: string }>;
}

function buildHref(page: number): string {
  return page > 1 ? `/account/orders?page=${page}` : '/account/orders';
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { page: pageParam } = await searchParams;
  const { listOrdersForCustomer } = getContainer();
  const allOrders = await listOrdersForCustomer.execute({ userId: user.id });

  const { items: pagedOrders, page, totalPages } = paginate(
    allOrders,
    parsePage(pageParam),
    DEFAULT_PAGE_SIZE,
  );

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Order history</h1>

        {allOrders.length === 0 ? (
          <p className={styles.empty}>You haven&apos;t placed any orders yet.</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOrders.map((order) => (
                    <tr key={order.id} className={styles.row}>
                      <td>
                        <Link href={`/account/orders/${order.id}`} className={styles.cellLink}>
                          {order.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/account/orders/${order.id}`} className={styles.cellLink}>
                          {order.createdAt.toLocaleDateString()}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/account/orders/${order.id}`} className={styles.cellLink}>
                          {Money.of(order.amountMinor, order.currency).toString()}
                        </Link>
                      </td>
                      <td>
                        <Link
                          href={`/account/orders/${order.id}`}
                          className={`${styles.cellLink} ${styles.statusCell}`}
                        >
                          <Badge tone={paymentStatusTone(order.paymentStatus)}>
                            {order.paymentStatus}
                          </Badge>
                          <Badge tone={fulfillmentStatusTone(order.fulfillmentStatus)}>
                            {order.fulfillmentStatus}
                          </Badge>
                        </Link>
                      </td>
                      <td className={styles.actionsCell}>
                        {isOrderCancellable(order.paymentStatus) && (
                          <CancelOrderButton orderId={order.id} action={cancelOwnOrderAction} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
