import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Domain payment status -> the 4 states BitcoinCheckout renders. */
const WIDGET_STATUS: Record<PaymentStatus, 'awaiting' | 'confirming' | 'paid' | 'expired'> = {
  pending: 'awaiting',
  awaiting_payment: 'awaiting',
  awaiting_confirmation: 'confirming',
  paid: 'paid',
  failed: 'expired',
  expired: 'expired',
  refunded: 'expired',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { orders } = getContainer();

  const status = await orders.getPaymentStatus(id);
  if (status === null) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 });
  }

  return NextResponse.json({ status: WIDGET_STATUS[status] });
}
