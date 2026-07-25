'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { env } from '@/config/env';
import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import { getSessionUser, resolveCartOwner } from '@/app/lib/session';
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
  saveAddress: z.string().optional(),
  couponCode: z.string().optional(),
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
    saveAddress: formData.get('saveAddress') || undefined,
    couponCode: formData.get('couponCode') || undefined,
  });
  if (!parsed.success) return { error: 'Please fill in a valid email and shipping address.' };

  const ip = await getClientIp();
  const checkoutLimit = await checkRateLimit(`checkout-start:${ip}`, 10, 60 * 60);
  if (!checkoutLimit.allowed) {
    return { error: tooManyAttemptsMessage(checkoutLimit.retryAfterSeconds) };
  }

  const owner = await resolveCartOwner();
  const { placeOrder, startCheckout, sendOrderConfirmationEmail, addSavedAddress } = getContainer();

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
    couponCode: parsed.data.couponCode,
  });
  if (isErr(placed)) {
    return {
      error:
        placed.error.code === 'empty_cart'
          ? 'Your cart is empty.'
          : placed.error.code === 'invalid_coupon'
            ? "That coupon code isn't valid."
            : 'An item in your cart is no longer available.',
    };
  }

  // Only logged-in visitors have an account to attach a saved address to —
  // guests can still check the box, it's just silently a no-op for them.
  if (parsed.data.saveAddress) {
    const user = await getSessionUser();
    if (user) {
      try {
        await addSavedAddress.execute({
          userId: user.id,
          name: parsed.data.shippingName,
          line1: parsed.data.shippingLine1,
          line2: parsed.data.shippingLine2,
          city: parsed.data.shippingCity,
          region: parsed.data.shippingRegion,
          postalCode: parsed.data.shippingPostalCode,
          country: parsed.data.shippingCountry,
        });
      } catch (e) {
        logger.warn('checkout: saving address failed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
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

  // Placing the order empties the cart — the Header's cart-count badge
  // lives in the root layout and needs an explicit revalidation (see
  // cart.ts) so the payment screen we're about to redirect to, and any
  // later navigation, doesn't keep showing the pre-checkout count.
  revalidatePath('/', 'layout');

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
