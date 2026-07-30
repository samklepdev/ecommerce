import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { checkRateLimit, getClientIp } from '@/app/lib/rate-limit';
import { toWidgetStatus } from '@/app/(storefront)/checkout/bitcoin-checkout-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The checkout widget polls this every 5s while a payment is outstanding,
 * so the ceiling has to clear that with room for a couple of open tabs — but
 * it's unauthenticated and takes an order id, so without any ceiling it's
 * also a free enumeration oracle and an unbounded read on the orders table.
 * 120/min is ~10x one widget's rate. */
const POLL_LIMIT = 120;
const POLL_WINDOW_SECONDS = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const ip = await getClientIp();
  const limit = await checkRateLimit(`order-status:${ip}`, POLL_LIMIT, POLL_WINDOW_SECONDS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds ?? 60) } },
    );
  }

  const { getPaymentProgress } = getContainer();

  const progress = await getPaymentProgress.execute({ orderId: id });
  if (progress === null) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: toWidgetStatus(progress.status),
    confirmations: progress.confirmations,
    requiredConfirmations: progress.requiredConfirmations,
    underpaid: progress.underpaid,
    overpaid: progress.overpaid,
  });
}
