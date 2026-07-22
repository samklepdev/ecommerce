'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isErr } from '@/shared/domain/result';
import { getContainer } from '@/composition/container';
import { requireUser } from '@/app/lib/session';

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
