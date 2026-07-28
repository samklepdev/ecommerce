import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { toWidgetStatus } from '@/app/(storefront)/checkout/bitcoin-checkout-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    status: toWidgetStatus(progress.status),
    confirmations: progress.confirmations,
    requiredConfirmations: progress.requiredConfirmations,
    underpaid: progress.underpaid,
    overpaid: progress.overpaid,
  });
}
