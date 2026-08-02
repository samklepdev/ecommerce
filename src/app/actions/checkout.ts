'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { jobIdFor } from '@/shared/application/ports/job-queue';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import { getSessionUser, resolveCartOwner } from '@/app/lib/session';
import { checkRateLimit, getClientIp, ipKeySegment, tooManyAttemptsMessage } from '@/app/lib/rate-limit';
import { addressFieldSchemas, countrySchema, postalCodeSchema, refineAddress } from '@/app/lib/address-schema';

const StartCheckoutSchema = z
  .object({
    customerEmail: z.string().email(),
    // The shared field schemas, not bare `min(1)`: those accepted a single
    // space, which then threw inside `ShippingAddress.create` and surfaced as a
    // 500 rather than a field error — on the busiest form in the app. They also
    // bound the lengths, so a 100 kB name can't reach a shipping label.
    shippingName: addressFieldSchemas.name,
    shippingLine1: addressFieldSchemas.line1,
    shippingLine2: addressFieldSchemas.line2,
    shippingCity: addressFieldSchemas.city,
    shippingRegion: z.string().trim().min(1),
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
  const checkoutLimit = await checkRateLimit(`checkout-start:${ipKeySegment(ip)}`, 10, 60 * 60);
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
    // A lookup rather than a nested ternary: every code needs its own wording,
    // and the fallback here used to claim an item was unavailable for causes
    // that had nothing to do with availability.
    const messages: Record<typeof placed.error.code, string> = {
      empty_cart: 'Your cart is empty.',
      invalid_coupon: "That coupon code isn't valid, or it has expired.",
      // Won the race for the last redemption and lost. Says what happened
      // rather than blaming the code, because nothing the customer did was
      // wrong and their cart is gone.
      coupon_exhausted:
        'That coupon was fully redeemed while you were checking out — your order was not placed. Add the items again and order without it, or get in touch.',
      store_closed:
        'Ordering is paused right now — nothing was charged, and your cart is saved.',
      // A double-click. The first submit won and is already redirecting, so
      // this must not read as a failure — nothing went wrong.
      cart_already_submitted: 'This order was already submitted — check your orders for it.',
      // Points at the cart, which now flags the offending line by name. The
      // bare version of this message named no item, so a customer with several
      // in the cart could only find it by removing them one at a time and
      // resubmitting — which also burns the checkout rate limit.
      product_unavailable:
        'An item in your cart is no longer available — go back to your cart and remove the one marked unavailable.',
    };
    return { error: messages[placed.error.code] };
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

  // Placing the order empties the cart — the Header's cart-count badge
  // lives in the root layout and needs an explicit revalidation (see
  // cart.ts) so the payment screen we're about to redirect to, and any
  // later navigation, doesn't keep showing the pre-checkout count.
  revalidatePath('/', 'layout');

  /**
   * Queued **before** checkout is attempted, not after it succeeds.
   *
   * This email carries the only link back to the order, and for a guest it is
   * the only record they have of it at all. Sending it only on the happy path
   * meant the one case where they most needed it — the cart already claimed,
   * the order written, and the gateway then failing — was the one case where
   * it never arrived.
   *
   * Queued, not sent here: a customer used to wait for the mail provider
   * before their payment page rendered, and a provider timeout meant the
   * email was simply lost with nothing to retry it.
   */
  try {
    await jobQueue.enqueue(
      'email.order-confirmation',
      { orderId: placed.value.id, customerEmail: parsed.data.customerEmail },
      { jobId: jobIdFor('order-confirmation', placed.value.id) },
    );
  } catch (e) {
    // Redis is down. The order exists — that matters more than the receipt,
    // so this is logged rather than surfaced.
    logger.error('checkout: could not queue the order confirmation email', {
      orderId: placed.value.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const result = await startCheckout.execute({
    orderId: placed.value.id,
    customerEmail: parsed.data.customerEmail,
    paymentMethod: 'crypto',
    idempotencyKey: placed.value.id,
  });
  if (isErr(result)) {
    /**
     * The order exists and the cart is gone, so returning an error string here
     * stranded the customer completely: "try again" sent them to an empty
     * cart, and they were never told the order id.
     *
     * Redirecting to the order gives them the one thing they need — a durable
     * page for the thing they just committed to. It reads the failure off the
     * order's own state (payable, but no payment session) and offers to set
     * payment up again, so the recovery lives somewhere they can return to
     * rather than in a form submission they've already navigated away from.
     */
    logger.error('checkout: order placed but payment could not be started', {
      orderId: placed.value.id,
      code: result.error.code,
    });
  }

  redirect(`/orders/${placed.value.id}`);
}
