'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import { resolveCartOwner } from '@/app/lib/session';
import { checkRateLimit, getClientIp, tooManyAttemptsMessage } from '@/app/lib/rate-limit';

const StartCheckoutSchema = z.object({
  customerEmail: z.string().email(),
  shippingName: z.string().min(1),
  shippingLine1: z.string().min(1),
  shippingLine2: z.string().optional(),
  shippingCity: z.string().min(1),
  shippingRegion: z.string().min(1),
  shippingPostalCode: z.string().min(1),
  shippingCountry: z.string().min(1),
});

export interface StartCheckoutActionResult {
  error?: string;
}

export async function startCheckoutAction(
  _prevState: StartCheckoutActionResult | undefined,
  formData: FormData,
): Promise<StartCheckoutActionResult> {
  const parsed = StartCheckoutSchema.safeParse({
    customerEmail: formData.get('customerEmail'),
    shippingName: formData.get('shippingName'),
    shippingLine1: formData.get('shippingLine1'),
    shippingLine2: formData.get('shippingLine2') || undefined,
    shippingCity: formData.get('shippingCity'),
    shippingRegion: formData.get('shippingRegion'),
    shippingPostalCode: formData.get('shippingPostalCode'),
    shippingCountry: formData.get('shippingCountry'),
  });
  if (!parsed.success) return { error: 'Please fill in a valid email and shipping address.' };

  const ip = await getClientIp();
  const checkoutLimit = await checkRateLimit(`checkout-start:${ip}`, 10, 60 * 60);
  if (!checkoutLimit.allowed) {
    return { error: tooManyAttemptsMessage(checkoutLimit.retryAfterSeconds) };
  }

  const owner = await resolveCartOwner();
  const { placeOrder, startCheckout, sendOrderConfirmationEmail } = getContainer();

  const placed = await placeOrder.execute({
    owner,
    customerEmail: parsed.data.customerEmail,
    currency: 'USD',
    shippingAddress: {
      name: parsed.data.shippingName,
      line1: parsed.data.shippingLine1,
      line2: parsed.data.shippingLine2,
      city: parsed.data.shippingCity,
      region: parsed.data.shippingRegion,
      postalCode: parsed.data.shippingPostalCode,
      country: parsed.data.shippingCountry,
    },
  });
  if (isErr(placed)) {
    return {
      error:
        placed.error.code === 'empty_cart'
          ? 'Your cart is empty.'
          : 'An item in your cart is no longer available.',
    };
  }

  const result = await startCheckout.execute({
    orderId: placed.value.id,
    customerEmail: parsed.data.customerEmail,
    paymentMethod: 'crypto',
    idempotencyKey: placed.value.id,
  });
  if (isErr(result)) {
    return { error: 'Could not start checkout — try again.' };
  }

  const orderUrl = `${env.APP_URL}/orders/${placed.value.id}`;
  try {
    await sendOrderConfirmationEmail.execute({
      customerEmail: parsed.data.customerEmail,
      orderId: placed.value.id,
      lines: placed.value.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      totalDisplay: placed.value.total.toString(),
      orderUrl,
    });
  } catch (e) {
    logger.warn('checkout: order confirmation email failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  redirect(`/orders/${placed.value.id}`);
}
