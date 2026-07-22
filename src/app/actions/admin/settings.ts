'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { parseDecimalToMinorUnits } from '@/shared/domain/parse-decimal-amount';

const UpdateShippingRateSchema = z.object({
  price: z.string().min(1),
  currency: z.string().length(3),
});

export interface UpdateShippingRateActionResult {
  message?: string;
  error?: string;
}

export async function updateShippingRateAction(
  _prevState: UpdateShippingRateActionResult | undefined,
  formData: FormData,
): Promise<UpdateShippingRateActionResult> {
  const admin = await requireAdmin();
  const parsed = UpdateShippingRateSchema.safeParse({
    price: formData.get('price'),
    currency: formData.get('currency'),
  });
  if (!parsed.success) return { error: 'Enter a valid price.' };

  const amountMinor = parseDecimalToMinorUnits(parsed.data.price);
  // Zero is valid (free shipping) — only reject malformed/negative input.
  if (amountMinor === null || amountMinor < 0) return { error: 'Enter a valid price.' };

  const { setShippingRate, recordAuditLogEntry } = getContainer();
  await setShippingRate.execute({ amountMinor, currency: parsed.data.currency });

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'shipping_rate.changed',
    targetType: 'shipping_rate',
    targetId: 'default',
    metadata: { amountMinor, currency: parsed.data.currency },
  });

  revalidatePath('/admin/settings');
  revalidatePath('/cart');
  revalidatePath('/checkout');
  return { message: 'Shipping rate updated.' };
}
