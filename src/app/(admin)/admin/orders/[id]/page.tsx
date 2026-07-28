import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { OrderDetailView } from '@/app/(storefront)/orders/OrderDetailView';
import { Badge } from '@/components/ui/Badge';
import { RefundOrderButton } from './RefundOrderButton';
import { FailOrderButton } from './FailOrderButton';
import { MarkDeliveredButton } from './MarkDeliveredButton';
import { OrderNotesEditor } from './OrderNotesEditor';
import { OrderEventsTimeline } from './OrderEventsTimeline';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  await requireAdmin();
  const { id } = await params;

  const { getOrderDetail, getShipmentsForOrder, listOrderEvents } = getContainer();

  const order = await getOrderDetail.execute({ orderId: id });
  if (!order) notFound();

  const [shipments, events] = await Promise.all([
    getShipmentsForOrder.execute({ orderId: order.id }),
    listOrderEvents.execute({ orderId: order.id }),
  ]);

  return (
    <div className={styles.page}>
      {/* `contained={false}`: this page supplies the container, so the card
          lines up with the panels below instead of sitting 960px wide
          inside them. */}
      <OrderDetailView
        order={order}
        shipments={shipments}
        paymentSession={null}
        backHref="/admin/orders"
        backLabel="Back to orders"
        contained={false}
      />
      <div className={styles.actions}>
        {order.paymentRecoveredFrom && (
          <Badge tone="warning">Recovered from {order.paymentRecoveredFrom}</Badge>
        )}
        <RefundOrderButton orderId={order.id} paymentStatus={order.paymentStatus} />
        <FailOrderButton orderId={order.id} paymentStatus={order.paymentStatus} />
        <MarkDeliveredButton orderId={order.id} fulfillmentStatus={order.fulfillmentStatus} />
      </div>
      <OrderNotesEditor orderId={order.id} notes={order.notes} />
      <OrderEventsTimeline events={events} />
    </div>
  );
}
