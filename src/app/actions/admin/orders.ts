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
  await requireAdmin();
  const parsed = MarkOrderRefundedSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) return { error: 'Missing order.' };

  const { markOrderRefunded } = getContainer();
  const result = await markOrderRefunded.execute({ orderId: parsed.data.orderId });
  if (isErr(result)) {
    return {
      error:
        result.error.code === 'not_found'
          ? 'Order not found.'
          : 'This order cannot be marked refunded from its current status.',
    };
  }

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath('/admin/orders');
  return { message: 'Order marked refunded.' };
}
