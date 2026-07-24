'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireAdmin } from '@/app/lib/session';

const MarkOrderRefundedSchema = z.object({
  orderId: z.string().min(1),
});

export interface MarkOrderRefundedActionResult {
  message?: string;
  error?: string;
}

export async function markOrderRefundedAction(
  _prevState: MarkOrderRefundedActionResult | undefined,
  formData: FormData,
): Promise<MarkOrderRefundedActionResult> {
  const admin = await requireAdmin();
  const parsed = MarkOrderRefundedSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { markOrderRefunded, recordAuditLogEntry } = getContainer();
  const result = await markOrderRefunded.execute({ orderId: parsed.data.orderId });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'not_found'
          ? 'Order not found.'
          : 'This order cannot be marked refunded from its current status.',
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'order.refunded',
    targetType: 'order',
    targetId: parsed.data.orderId,
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath('/admin/orders');
  return { message: 'Order marked refunded.' };
}

const FailOrderSchema = z.object({
  orderId: z.string().min(1),
});

export interface FailOrderActionResult {
  message?: string;
  error?: string;
}

/** Manual override for an order stuck in awaiting_confirmation — otherwise
 * FailStuckAwaitingConfirmationOrders resolves it automatically after 48h. */
export async function failOrderAction(
  _prevState: FailOrderActionResult | undefined,
  formData: FormData,
): Promise<FailOrderActionResult> {
  const admin = await requireAdmin();
  const parsed = FailOrderSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { failOrder, recordAuditLogEntry } = getContainer();
  const result = await failOrder.execute({ orderId: parsed.data.orderId });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'not_found'
          ? 'Order not found.'
          : 'This order cannot be marked failed from its current status.',
    };
  }

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'order.failed',
    targetType: 'order',
    targetId: parsed.data.orderId,
  });

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath('/admin/orders');
  return { message: 'Order marked failed.' };
}

const MarkOrderDeliveredSchema = z.object({
  orderId: z.string().min(1),
});

export interface MarkOrderDeliveredActionResult {
  message?: string;
  error?: string;
}

/** No carrier webhook exists to detect delivery automatically — an admin
 * records it once the shipment has actually arrived. Routine fulfillment
 * update, same as marking a supplier order shipped — not audit-logged. */
export async function markOrderDeliveredAction(
  _prevState: MarkOrderDeliveredActionResult | undefined,
  formData: FormData,
): Promise<MarkOrderDeliveredActionResult> {
  await requireAdmin();
  const parsed = MarkOrderDeliveredSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { markOrderDelivered } = getContainer();
  const result = await markOrderDelivered.execute({ orderId: parsed.data.orderId });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'not_found'
          ? 'Order not found.'
          : 'This order cannot be marked delivered from its current status.',
    };
  }

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath('/admin/orders');
  return { message: 'Order marked delivered.' };
}
