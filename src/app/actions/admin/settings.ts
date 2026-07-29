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

const SetStoreAvailabilitySchema = z.object({
  isOpen: z.enum(['true', 'false']).transform((v) => v === 'true'),
  reason: z.string().max(200).optional(),
});

export interface SetStoreAvailabilityActionResult {
  message?: string;
  error?: string;
}

/**
 * The kill switch's ordinary door. The CLI script and the token URL exist
 * for when this one isn't reachable.
 *
 * Unlike those two, this path can invalidate the render cache, so the closed
 * page goes up immediately instead of waiting for a revalidation — hence the
 * layout-wide `revalidatePath` below.
 */
export async function setStoreAvailabilityAction(
  _prevState: SetStoreAvailabilityActionResult | undefined,
  formData: FormData,
): Promise<SetStoreAvailabilityActionResult> {
  const admin = await requireAdmin();
  const parsed = SetStoreAvailabilitySchema.safeParse({
    isOpen: formData.get('isOpen'),
    reason: formData.get('reason') || undefined,
  });
  if (!parsed.success) return { error: 'Could not read the requested state.' };

  const { setStoreAvailability } = getContainer();
  await setStoreAvailability.execute({
    isOpen: parsed.data.isOpen,
    reason: parsed.data.reason ?? null,
    actor: { userId: admin.id, email: admin.email },
  });

  // Every storefront route renders through the gated layout, so the whole
  // layout tree is what needs rebuilding — not one path.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/settings');

  return {
    message: parsed.data.isOpen
      ? 'Store reopened — customers can browse and check out again.'
      : 'Store closed. Checkout refuses and the storefront shows a paused notice.',
  };
}
