import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Domain payment status -> the states BitcoinCheckout renders. `failed`
 * and `refunded` each get their own state — collapsing them into `expired`
 * would tell a refunded customer their payment window merely expired. */
const WIDGET_STATUS: Record<
  PaymentStatus,
  'awaiting' | 'confirming' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded'
> = {
  pending: 'awaiting',
  awaiting_payment: 'awaiting',
  awaiting_confirmation: 'confirming',
  paid: 'paid',
  failed: 'failed',
  expired: 'expired',
  cancelled: 'cancelled',
  refunded: 'refunded',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { getPaymentProgress } = getContainer();

  const progress = await getPaymentProgress.execute({ orderId: id });
  if (progress === null) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: WIDGET_STATUS[progress.status],
    confirmations: progress.confirmations,
    requiredConfirmations: progress.requiredConfirmations,
    underpaid: progress.underpaid,
    overpaid: progress.overpaid,
  });
}
