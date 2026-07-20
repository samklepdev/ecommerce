import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { OrderDetailView } from '../OrderDetailView';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PublicOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

const AWAITING_PAYMENT_STATUSES = new Set(['pending', 'awaiting_payment', 'awaiting_confirmation']);

/**
 * No login required — knowledge of the order id (a randomUUID, effectively
 * unguessable) is the access capability, matching the existing
 * unauthenticated `/api/orders/[id]/status` route. This is how a guest
 * checkout finds their order again if the tab closes.
 */
export default async function PublicOrderDetailPage({ params }: PublicOrderDetailPageProps) {
  const { id } = await params;
  const { getOrderDetail, getPaymentSessionForOrder, getShipmentsForOrder } = getContainer();

  const order = await getOrderDetail.execute({ orderId: id });
  if (!order) notFound();

  const shipments = await getShipmentsForOrder.execute({ orderId: order.id });

  let paymentSession = null;
  if (AWAITING_PAYMENT_STATUSES.has(order.paymentStatus)) {
    paymentSession = await getPaymentSessionForOrder.execute({ orderId: order.id });
  }

  return (
    <OrderDetailView
      order={order}
      shipments={shipments}
      paymentSession={paymentSession}
      backHref="/"
      backLabel="Back to store"
    />
  );
}
