import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { OrderDetailView } from '@/app/(storefront)/orders/OrderDetailView';
import { Badge } from '@/components/ui/Badge';
import { RefundOrderButton } from './RefundOrderButton';
import { FailOrderButton } from './FailOrderButton';
import { MarkDeliveredButton } from './MarkDeliveredButton';
import { OrderNotesEditor } from './OrderNotesEditor';

export const dynamic = 'force-dynamic';

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  await requireAdmin();
  const { id } = await params;

  const { getOrderDetail, getShipmentsForOrder } = getContainer();

  const order = await getOrderDetail.execute({ orderId: id });
  if (!order) notFound();

  const shipments = await getShipmentsForOrder.execute({ orderId: order.id });

  return (
    <>
      <OrderDetailView
        order={order}
        shipments={shipments}
        paymentSession={null}
        backHref="/admin/orders"
        backLabel="Back to orders"
      />
      {order.paymentRecoveredFrom && (
        <Badge tone="warning">Recovered from {order.paymentRecoveredFrom}</Badge>
      )}
      <RefundOrderButton orderId={order.id} paymentStatus={order.paymentStatus} />
      <FailOrderButton orderId={order.id} paymentStatus={order.paymentStatus} />
      <MarkDeliveredButton orderId={order.id} fulfillmentStatus={order.fulfillmentStatus} />
      <OrderNotesEditor orderId={order.id} notes={order.notes} />
    </>
  );
}
