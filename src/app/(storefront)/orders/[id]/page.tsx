import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { cancelOrderByIdAction, reorderOrderByIdAction } from '@/app/actions/orders';
import { OrderDetailView } from '../OrderDetailView';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PublicOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

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

  // Fetched for every status, not just the awaiting ones. The panel holds
  // the "Payment confirmed" and "expired" copy, so gating it on awaiting
  // meant it vanished at the exact moment payment settled — the most
  // anxious moment of an irreversible purchase. It's null only when the
  // order never had a BTC intent at all.
  const paymentSession = await getPaymentSessionForOrder.execute({ orderId: order.id });

  return (
    <OrderDetailView
      order={order}
      shipments={shipments}
      paymentSession={paymentSession}
      backHref="/"
      backLabel="Back to store"
      cancelAction={cancelOrderByIdAction}
      reorderAction={reorderOrderByIdAction}
    />
  );
}
