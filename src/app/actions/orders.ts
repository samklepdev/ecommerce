'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isErr } from '@/shared/domain/result';
import { getContainer } from '@/composition/container';
import { requireUser, resolveCartOwner } from '@/app/lib/session';
import { checkRateLimit, getClientIp, ipKeySegment, tooManyAttemptsMessage } from '@/app/lib/rate-limit';

const CancelOrderSchema = z.object({
  orderId: z.string().min(1),
});

export interface CancelOrderActionResult {
  message?: string;
  error?: string;
}

const NOT_CANCELLABLE_MESSAGE =
  'This order can no longer be cancelled — it may already be paid, or a payment may already be in progress.';

/** Account-scoped path — ownership is enforced by CancelOrder/CancelOrderRepository
 * via the caller's own userId. */
export async function cancelOwnOrderAction(
  _prevState: CancelOrderActionResult | undefined,
  formData: FormData,
): Promise<CancelOrderActionResult> {
  const user = await requireUser();
  const parsed = CancelOrderSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { cancelOrder } = getContainer();
  const result = await cancelOrder.execute({ orderId: parsed.data.orderId, userId: user.id });
  if (isErr(result)) return { error: NOT_CANCELLABLE_MESSAGE };

  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${parsed.data.orderId}`);
  return { message: 'Order cancelled.' };
}

/** Guest/id-only path — no login check at all, matching the guest order
 * page's existing trust model (the order id itself is the access
 * capability). */
export async function cancelOrderByIdAction(
  _prevState: CancelOrderActionResult | undefined,
  formData: FormData,
): Promise<CancelOrderActionResult> {
  const parsed = CancelOrderSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { cancelOrder } = getContainer();
  const result = await cancelOrder.execute({ orderId: parsed.data.orderId, userId: null });
  if (isErr(result)) return { error: NOT_CANCELLABLE_MESSAGE };

  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { message: 'Order cancelled.' };
}

const ReorderSchema = z.object({
  orderId: z.string().min(1),
});

export interface ReorderActionResult {
  message?: string;
  error?: string;
}

function reorderResultMessage(addedCount: number, unavailableNames: string[]): string {
  if (addedCount === 0) return 'None of the items in that order are available anymore.';
  if (unavailableNames.length === 0) return `Added ${addedCount} item(s) to your cart.`;
  return `Added ${addedCount} item(s) to your cart. ${unavailableNames.length} item(s) are no longer available (${unavailableNames.join(', ')}).`;
}

/** Account-scoped path — mirrors cancelOwnOrderAction. Always resolves
 * the cart via resolveCartOwner() (the visitor's own current cart), which
 * is independent of the order's ownership. */
export async function reorderOwnOrderAction(
  _prevState: ReorderActionResult | undefined,
  formData: FormData,
): Promise<ReorderActionResult> {
  const user = await requireUser();
  const parsed = ReorderSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const owner = await resolveCartOwner();
  const { reorderItems } = getContainer();
  const result = await reorderItems.execute({ owner, orderId: parsed.data.orderId, ownerUserId: user.id });
  if (isErr(result)) return { error: 'That order could not be found.' };

  revalidatePath('/cart');
  // See cart.ts — the Header's cart-count badge lives in the root layout
  // and needs an explicit revalidation whenever cart contents change.
  revalidatePath('/', 'layout');
  return { message: reorderResultMessage(result.value.addedCount, result.value.unavailableNames) };
}

/** Guest/id-only path — mirrors cancelOrderByIdAction, no auth check. */
export async function reorderOrderByIdAction(
  _prevState: ReorderActionResult | undefined,
  formData: FormData,
): Promise<ReorderActionResult> {
  const parsed = ReorderSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const owner = await resolveCartOwner();
  const { reorderItems } = getContainer();
  const result = await reorderItems.execute({ owner, orderId: parsed.data.orderId, ownerUserId: null });
  if (isErr(result)) return { error: 'That order could not be found.' };

  revalidatePath('/cart');
  // See cart.ts — the Header's cart-count badge lives in the root layout
  // and needs an explicit revalidation whenever cart contents change.
  revalidatePath('/', 'layout');
  return { message: reorderResultMessage(result.value.addedCount, result.value.unavailableNames) };
}

const FindOrderSchema = z.object({
  email: z.string().email(),
});

export interface FindOrderActionResult {
  message?: string;
  error?: string;
}

/** "Find my order" — resends the confirmation email(s) for every order
 * under the given address. Same "don't reveal whether it matched anything"
 * convention as password reset: the message is identical either way. */
export async function findOrderAction(
  _prevState: FindOrderActionResult | undefined,
  formData: FormData,
): Promise<FindOrderActionResult> {
  const parsed = FindOrderSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'Enter a valid email address.' };

  const ip = await getClientIp();
  const limit = await checkRateLimit(`find-order:${ipKeySegment(ip)}:${parsed.data.email}`, 3, 60 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const { resendOrderConfirmations } = getContainer();
  await resendOrderConfirmations.execute({ email: parsed.data.email });

  return { message: 'If that email has any orders, we’ve resent the confirmation email(s).' };
}

const RefreshQuoteSchema = z.object({ orderId: z.string().min(1) });

export interface RefreshQuoteActionResult {
  message?: string;
  error?: string;
}

/**
 * Gives a lapsed rate lock a fresh price, on the same address.
 *
 * Unauthenticated for the same reason the order page is: the order id is the
 * capability. Rate-limited anyway — each call hits the rate feed, and a
 * refresh button is trivially hammerable.
 */
export async function refreshPaymentQuoteAction(
  _prevState: RefreshQuoteActionResult | undefined,
  formData: FormData,
): Promise<RefreshQuoteActionResult> {
  const parsed = RefreshQuoteSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const ip = await getClientIp();
  const limit = await checkRateLimit(`refresh-quote:${ipKeySegment(ip)}:${parsed.data.orderId}`, 10, 15 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const { refreshPaymentQuote } = getContainer();
  const result = await refreshPaymentQuote.execute({ orderId: parsed.data.orderId });

  if (isErr(result)) {
    switch (result.error.code) {
      case 'window_closed':
        return { error: 'This order has expired. Please start checkout again.' };
      case 'not_awaiting_payment':
        return { error: 'This order is no longer waiting for payment.' };
      // Not an error on their part — they've paid. Saying "couldn't refresh
      // the price" here would read as a failure and invite them to send
      // again, which is how someone ends up paying twice for one order.
      case 'payment_in_flight':
        return {
          message:
            "We can see your payment — no need to send anything else. The amount you were quoted still stands, and this page will update once it's confirmed.",
        };
      default:
        return { error: "Couldn't refresh the price just now. Try again in a moment." };
    }
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { message: 'Price updated.' };
}

const ResumePaymentSchema = z.object({ orderId: z.string().min(1) });

export interface ResumePaymentActionResult {
  message?: string;
  error?: string;
}

/**
 * Sets up payment for an order that has none.
 *
 * `PlaceOrder` and `StartCheckout` are two calls, and the first one claims the
 * cart. When the second failed — the rate feed down, Redis unavailable — the
 * customer was left with no cart, no order id, and an order that could never be
 * paid. This is the way back: same order, same lines, a fresh address.
 *
 * Safe to press twice. `createPayment` returns the existing intent when the
 * order already has one, and `markAwaitingPayment` is compare-and-set, so this
 * can neither allocate a second address nor un-settle a paid order.
 *
 * Unauthenticated for the same reason the order page is: the order id is the
 * capability. Rate-limited because each call can reach the rate feed and
 * allocate an address index, which is a one-way counter.
 */
export async function resumePaymentAction(
  _prevState: ResumePaymentActionResult | undefined,
  formData: FormData,
): Promise<ResumePaymentActionResult> {
  const parsed = ResumePaymentSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const ip = await getClientIp();
  const limit = await checkRateLimit(`resume-payment:${ipKeySegment(ip)}:${parsed.data.orderId}`, 5, 15 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const { getOrderDetail, startCheckout } = getContainer();
  const order = await getOrderDetail.execute({ orderId: parsed.data.orderId });
  if (!order) return { error: 'Order not found.' };

  const result = await startCheckout.execute({
    orderId: order.id,
    customerEmail: order.customerEmail,
    paymentMethod: 'crypto',
    idempotencyKey: order.id,
  });

  if (isErr(result)) {
    switch (result.error.code) {
      case 'store_closed':
        return { error: 'Ordering is paused right now — nothing was charged. Try again shortly.' };
      case 'total_not_payable':
        return {
          error:
            "This order's total came to nothing to pay, so there's nothing to send. Get in touch quoting your order id and we'll sort it out.",
        };
      case 'order_closed':
        return { error: 'This order is no longer waiting for payment.' };
      default:
        return { error: "Couldn't set up payment just now. Try again in a moment." };
    }
  }

  revalidatePath(`/orders/${order.id}`);
  return { message: 'Payment details ready.' };
}
