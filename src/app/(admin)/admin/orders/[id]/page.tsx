import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import {
  areOrderLinesEditable,
  isOrderContactEditable,
} from '@/modules/orders/domain/order-status';
import { requireAdmin } from '@/app/lib/session';
import { OrderDetailView } from '@/app/(storefront)/orders/OrderDetailView';
import { Badge } from '@/components/ui/Badge';
import { RefundOrderButton } from './RefundOrderButton';
import { FailOrderButton } from './FailOrderButton';
import { MarkDeliveredButton } from './MarkDeliveredButton';
import { OrderNotesEditor } from './OrderNotesEditor';
import { OrderEventsTimeline } from './OrderEventsTimeline';
import { OrderLinesEditor } from './OrderLinesEditor';
import { OrderContactEditor } from './OrderContactEditor';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

/** How many products the "add to order" picker offers. */
const ADD_PRODUCT_CHOICES = 200;

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  await requireAdmin();
  const { id } = await params;

  const { getOrderDetail, getShipmentsForOrder, listOrderEvents, listAllProductsForAdmin } =
    getContainer();

  const order = await getOrderDetail.execute({ orderId: id });
  if (!order) notFound();

  const [shipments, events, catalog] = await Promise.all([
    getShipmentsForOrder.execute({ orderId: order.id }),
    listOrderEvents.execute({ orderId: order.id }),
    // The picker for "add a product to this order". Bounded — past this many
    // the answer is a search field, not a longer <select>.
    listAllProductsForAdmin.execute({ page: 1, pageSize: ADD_PRODUCT_CHOICES }),
  ]);

  const linesEditable = areOrderLinesEditable(order.paymentStatus);
  const contactEditable = isOrderContactEditable(order.paymentStatus, order.fulfillmentStatus);

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
      <OrderLinesEditor
        orderId={order.id}
        lines={order.lines.map((line) => ({
          id: line.id,
          productName: line.productName,
          quantity: line.quantity,
        }))}
        products={catalog.items.map((p) => ({ id: p.id, name: p.name }))}
        editable={linesEditable}
        paymentStatus={order.paymentStatus}
      />
      <OrderContactEditor
        orderId={order.id}
        customerEmail={order.customerEmail}
        shippingAddress={order.shippingAddress}
        editable={contactEditable}
      />
      <OrderNotesEditor orderId={order.id} notes={order.notes} />
      <OrderEventsTimeline events={events} />
    </div>
  );
}
