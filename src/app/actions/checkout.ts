'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { jobIdFor } from '@/shared/application/ports/job-queue';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import { getSessionUser, resolveCartOwner } from '@/app/lib/session';
import { checkRateLimit, getClientIp, tooManyAttemptsMessage } from '@/app/lib/rate-limit';
import { countrySchema, postalCodeSchema, refineAddress } from '@/app/lib/address-schema';

const StartCheckoutSchema = z
  .object({
    customerEmail: z.string().email(),
    shippingName: z.string().min(1),
    shippingLine1: z.string().min(1),
    shippingLine2: z.string().optional(),
    shippingCity: z.string().min(1),
    shippingRegion: z.string().min(1),
    shippingPostalCode: postalCodeSchema,
    shippingCountry: countrySchema,
    saveAddress: z.string().optional(),
    couponCode: z.string().optional(),
  })
  .superRefine((data, ctx) =>
    refineAddress(
      {
        country: data.shippingCountry,
        region: data.shippingRegion,
        postalCode: data.shippingPostalCode,
      },
      ctx,
      // This form namespaces its address inputs, so issues have to be
      // reported against those names rather than the logical ones.
      (field) => `shipping${field.charAt(0).toUpperCase()}${field.slice(1)}`,
    ),
  );

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
  const { placeOrder, startCheckout, jobQueue, addSavedAddress } = getContainer();

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
            : placed.error.code === 'store_closed'
              ? // Named explicitly: the fallback below would otherwise tell a
                // customer an item was unavailable, which is both wrong and
                // the kind of message that makes someone re-add their cart.
                'Ordering is paused right now — nothing was charged, and your cart is saved.'
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
    return {
      error:
        result.error.code === 'store_closed'
          ? 'Ordering is paused right now — nothing was charged.'
          : 'Could not start checkout — try again.',
    };
  }

  // Placing the order empties the cart — the Header's cart-count badge
  // lives in the root layout and needs an explicit revalidation (see
  // cart.ts) so the payment screen we're about to redirect to, and any
  // later navigation, doesn't keep showing the pre-checkout count.
  revalidatePath('/', 'layout');

  // Queued, not sent here. A customer used to wait for the mail provider
  // before their payment page rendered, and a provider timeout meant the
  // email was simply lost — there was nothing to retry it.
  try {
    await jobQueue.enqueue(
      'email.order-confirmation',
      { orderId: placed.value.id, customerEmail: parsed.data.customerEmail },
      { jobId: jobIdFor('order-confirmation', placed.value.id) },
    );
  } catch (e) {
    // Redis is down. The order exists and is payable — that matters more
    // than the receipt, so this is logged rather than surfaced.
    logger.error('checkout: could not queue the order confirmation email', {
      orderId: placed.value.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  redirect(`/orders/${placed.value.id}`);
}
