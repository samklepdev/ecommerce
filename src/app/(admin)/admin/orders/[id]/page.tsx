import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import {
  areOrderLinesEditable,
  isOrderContactEditable,
} from '@/modules/orders/domain/order-status';
import { requireAdmin } from '@/app/lib/session';
import { OrderDetailView } from '@/app/(storefront)/orders/OrderDetailView';
import { Badge } from '@/components/ui/Badge';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { FailOrderButton } from './FailOrderButton';
import { CancelOrderButton } from './CancelOrderButton';
import { CreditLatePaymentButton } from './CreditLatePaymentButton';
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

  const {
    getOrderDetail,
    getShipmentsForOrder,
    listOrderEvents,
    listAllProductsForAdmin,
    getPaymentSessionForOrder,
  } = getContainer();

  const order = await getOrderDetail.execute({ orderId: id });
  if (!order) notFound();

  const [shipments, events, catalog, paymentSession] = await Promise.all([
    getShipmentsForOrder.execute({ orderId: order.id }),
    listOrderEvents.execute({ orderId: order.id }),
    // The picker for "add a product to this order". Bounded — past this many
    // the answer is a search field, not a longer <select>.
    listAllProductsForAdmin.execute({ page: 1, pageSize: ADD_PRODUCT_CHOICES }),
    // Read for the late-payment figure only. Deliberately not handed to
    // `OrderDetailView` below: that renders the customer's polling checkout
    // widget, which has no business running on an admin screen.
    getPaymentSessionForOrder.execute({ orderId: order.id }),
  ]);

  /**
   * Bitcoin that turned up after this order closed. `SweepLatePayments` finds
   * it and counts it on the dashboard but deliberately won't settle it — a
   * closed order coming back to life is a business decision, so it is made
   * here, by a person, with the amount in view.
   */
  const creditableSats =
    (order.paymentStatus === 'expired' || order.paymentStatus === 'cancelled') &&
    paymentSession?.latePaymentSats
      ? paymentSession.latePaymentSats
      : null;

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
        {creditableSats !== null && (
          <CreditLatePaymentButton
            orderId={order.id}
            amountBtc={satsToBtcString(creditableSats)}
          />
        )}
        <FailOrderButton orderId={order.id} paymentStatus={order.paymentStatus} />
        <MarkDeliveredButton orderId={order.id} fulfillmentStatus={order.fulfillmentStatus} />
        <CancelOrderButton orderId={order.id} fulfillmentStatus={order.fulfillmentStatus} />
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
