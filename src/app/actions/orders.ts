'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isErr } from '@/shared/domain/result';
import { getContainer } from '@/composition/container';
import { requireUser, resolveCartOwner } from '@/app/lib/session';
import { checkRateLimit, getClientIp, tooManyAttemptsMessage } from '@/app/lib/rate-limit';

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

function reorderResultMessage(addedCount: number, unavailableSkus: string[]): string {
  if (addedCount === 0) return 'None of the items in that order are available anymore.';
  if (unavailableSkus.length === 0) return `Added ${addedCount} item(s) to your cart.`;
  return `Added ${addedCount} item(s) to your cart. ${unavailableSkus.length} item(s) are no longer available (${unavailableSkus.join(', ')}).`;
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
  return { message: reorderResultMessage(result.value.addedCount, result.value.unavailableSkus) };
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
  return { message: reorderResultMessage(result.value.addedCount, result.value.unavailableSkus) };
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
  const limit = await checkRateLimit(`find-order:${ip}:${parsed.data.email}`, 3, 60 * 60);
  if (!limit.allowed) return { error: tooManyAttemptsMessage(limit.retryAfterSeconds) };

  const { resendOrderConfirmations } = getContainer();
  await resendOrderConfirmations.execute({ email: parsed.data.email });

  return { message: 'If that email has any orders, we’ve resent the confirmation email(s).' };
}
