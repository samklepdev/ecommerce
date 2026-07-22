import { notFound, redirect } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { cancelOwnOrderAction } from '@/app/actions/orders';
import { OrderDetailView } from '../../../orders/OrderDetailView';

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

const AWAITING_PAYMENT_STATUSES = new Set(['pending', 'awaiting_payment', 'awaiting_confirmation']);

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const { getOrderDetailForCustomer, getPaymentSessionForOrder, getShipmentsForOrder } =
    getContainer();

  const order = await getOrderDetailForCustomer.execute({ orderId: id, userId: user.id });
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
      backHref="/account/orders"
      backLabel="Back to orders"
      cancelAction={cancelOwnOrderAction}
    />
  );
}
