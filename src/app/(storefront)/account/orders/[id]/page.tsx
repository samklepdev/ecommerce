import { notFound, redirect } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { cancelOwnOrderAction, reorderOwnOrderAction } from '@/app/actions/orders';
import { OrderDetailView } from '../../../orders/OrderDetailView';

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const { getOrderDetailForCustomer, getPaymentSessionForOrder, getShipmentsForOrder } =
    getContainer();

  const order = await getOrderDetailForCustomer.execute({ orderId: id, userId: user.id });
  if (!order) notFound();

  const shipments = await getShipmentsForOrder.execute({ orderId: order.id });

  // Every status, not just the awaiting ones — see the note on the public
  // order page: the panel carries the settled/expired copy too.
  const paymentSession = await getPaymentSessionForOrder.execute({ orderId: order.id });

  return (
    <OrderDetailView
      order={order}
      shipments={shipments}
      paymentSession={paymentSession}
      backHref="/account/orders"
      backLabel="Back to orders"
      cancelAction={cancelOwnOrderAction}
      reorderAction={reorderOwnOrderAction}
    />
  );
}
