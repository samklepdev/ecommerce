'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireAdmin, requireRecentAdminAuth } from '@/app/lib/session';

const CreateCouponSchema = z
  .object({
    code: z.string().min(1),
    discountType: z.enum(['percentage', 'fixed_amount']),
    percentageValue: z.coerce.number().int().min(1).max(100).optional(),
    // Dollars, as typed in the form — converted to minor units below.
    fixedAmountDisplay: z.coerce.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.discountType === 'percentage' ? data.percentageValue !== undefined : data.fixedAmountDisplay !== undefined,
    { message: 'Enter a value for the selected discount type.' },
  );

export interface CreateCouponActionResult {
  message?: string;
  error?: string;
}

export async function createCouponAction(
  _prevState: CreateCouponActionResult | undefined,
  formData: FormData,
): Promise<CreateCouponActionResult> {
  const admin = await requireAdmin();
  const parsed = CreateCouponSchema.safeParse({
    code: formData.get('code'),
    discountType: formData.get('discountType'),
    percentageValue: formData.get('percentageValue') || undefined,
    fixedAmountDisplay: formData.get('fixedAmountDisplay') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid coupon code and discount.' };
  }

  const { createCoupon, recordAuditLogEntry } = getContainer();
  const result = await createCoupon.execute({
    code: parsed.data.code,
    discountType: parsed.data.discountType,
    percentageValue: parsed.data.percentageValue,
    fixedAmountMinor:
      parsed.data.fixedAmountDisplay !== undefined
        ? Math.round(parsed.data.fixedAmountDisplay * 100)
        : undefined,
    currency: parsed.data.discountType === 'fixed_amount' ? 'USD' : undefined,
  });
  if (isErr(result)) return { error: 'That code is already in use.' };

  // Audited for the same reason `shipping_rate.changed` and
  // `products.bulk_markup` are: this changes what customers are charged.
  // The discount goes in as integer minor units, never the dollars the form
  // collected — a float is wrong in a metadata blob for exactly the reasons
  // it's wrong anywhere else.
  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'coupon.created',
    targetType: 'coupon',
    targetId: result.value.id,
    metadata: {
      code: result.value.code,
      discountType: result.value.discountType,
      percentageValue: result.value.percentageValue,
      fixedAmountMinor: result.value.fixedAmountMinor,
    },
  });

  revalidatePath('/admin/coupons');
  return { message: `Created coupon "${result.value.code}".` };
}

const SetCouponActiveSchema = z.object({
  id: z.string().min(1),
  isActive: z.enum(['true', 'false']),
});

export interface SetCouponActiveActionResult {
  message?: string;
  error?: string;
}

export async function setCouponActiveAction(
  _prevState: SetCouponActiveActionResult | undefined,
  formData: FormData,
): Promise<SetCouponActiveActionResult> {
  const admin = await requireAdmin();
  const parsed = SetCouponActiveSchema.safeParse({
    id: formData.get('id'),
    isActive: formData.get('isActive'),
  });
  if (!parsed.success) return { error: 'Missing coupon.' };

  const { setCouponActive, recordAuditLogEntry } = getContainer();
  const isActive = parsed.data.isActive === 'true';
  await setCouponActive.execute({ id: parsed.data.id, isActive });

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: isActive ? 'coupon.reactivated' : 'coupon.deactivated',
    targetType: 'coupon',
    targetId: parsed.data.id,
    metadata: {},
  });

  revalidatePath('/admin/coupons');
  return { message: isActive ? 'Coupon reactivated.' : 'Coupon deactivated.' };
}

const DeleteCouponSchema = z.object({
  id: z.string().min(1),
});

export interface DeleteCouponActionResult {
  message?: string;
  error?: string;
}

/**
 * Removes a coupon for good. Deactivating is the reversible option and is
 * usually what you want; this is for a code created by mistake.
 *
 * Safe to delete even while active, and even if orders used it: an order
 * snapshots the code and discount it was given, so its total and its receipt
 * are unaffected. What breaks is the code itself — anyone still holding it
 * gets "not a valid code" from the next checkout on.
 */
export async function deleteCouponAction(
  _prevState: DeleteCouponActionResult | undefined,
  formData: FormData,
): Promise<DeleteCouponActionResult> {
  // Destructive: refuses unless the password was typed recently.
  const sudo = await requireRecentAdminAuth();
  if (!sudo.ok) return { error: sudo.reason };
  const admin = sudo.admin;

  const parsed = DeleteCouponSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { error: 'Missing coupon.' };

  const { deleteCoupon, recordAuditLogEntry } = getContainer();
  const result = await deleteCoupon.execute({ id: parsed.data.id });
  if (isErr(result)) return { error: 'That coupon no longer exists.' };

  await recordAuditLogEntry.execute({
    actorUserId: admin.id,
    actorEmail: admin.email,
    action: 'coupon.deleted',
    targetType: 'coupon',
    targetId: parsed.data.id,
    metadata: {},
  });

  revalidatePath('/admin/coupons');
  return { message: 'Coupon deleted.' };
}
