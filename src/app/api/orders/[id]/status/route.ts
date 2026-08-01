import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { checkRateLimit } from '@/app/lib/rate-limit';
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

  /**
   * Keyed on the order, not the caller.
   *
   * The IP is read from a header, so keying on it meant every visitor whose
   * address couldn't be established shared one bucket — and one widget polls
   * twelve times a minute, so a handful of concurrent shoppers exhausted it
   * for everybody. A frozen widget is not a harmless failure here: it stops
   * updating, and an underpaid customer is left looking at whatever it last
   * rendered.
   *
   * The order id is the capability the caller already holds, so this bounds
   * exactly what needs bounding — hammering one order — without letting one
   * customer's traffic silence another's payment page.
   */
  const limit = await checkRateLimit(`order-status:${id}`, POLL_LIMIT, POLL_WINDOW_SECONDS);
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
    // The top-up figures. Safe to expose on an id-only endpoint: they say what
    // this order still owes, which is exactly what the person holding the order
    // link needs, and nothing about any other order.
    confirmedSats: progress.confirmedSats,
    // So the widget can say "we can see your payment" rather than showing a
    // countdown and a re-quote button at someone who has already sent it.
    pendingSats: progress.pendingSats,
    shortfallSats: progress.shortfallSats,
    topUpUri: progress.topUpUri,
  });
}
