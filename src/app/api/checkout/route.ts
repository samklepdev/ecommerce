import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { satsToBtcString } from '@/modules/payments/infrastructure/onchain-bitcoin-payment-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DEV ENTRY — creates an order from a posted amount and starts BTC checkout.
 * In production the order comes from cart checkout, not a raw amount. This lets
 * you exercise the full flow (derive address -> render QR -> watcher -> status)
 * before the cart/catalog modules exist.
 *
 * Returns everything BitcoinCheckout.tsx needs as props.
 */
const Body = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3).default('USD'),
  customerEmail: z.string().email(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { amountMinor, currency, customerEmail } = parsed.data;

  const { orders, startCheckout, paymentStore } = getContainer();

  const orderId = randomUUID();
  await orders.createDraft({ id: orderId, amountMinor, currency, customerEmail });

  const result = await startCheckout.execute({
    orderId,
    customerEmail,
    paymentMethod: 'crypto',
    idempotencyKey: orderId, // one checkout per order here
  });

  if (isErr(result)) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // Pull the locked sats amount for display from the persisted intent.
  const intent = await paymentStore.getByOrderId(orderId);
  if (!intent) {
    return NextResponse.json({ error: 'intent missing after checkout' }, { status: 500 });
  }

  return NextResponse.json({
    orderId,
    address: result.value.reference,
    amountBtc: satsToBtcString(intent.expectedSats),
    bip21: result.value.bip21Uri,
    expiresAt: result.value.expiresAt?.toISOString(),
    statusUrl: `/api/orders/${orderId}/status`,
  });
}
