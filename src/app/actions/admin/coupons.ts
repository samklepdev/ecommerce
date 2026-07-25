'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireAdmin } from '@/app/lib/session';

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
  await requireAdmin();
  const parsed = CreateCouponSchema.safeParse({
    code: formData.get('code'),
    discountType: formData.get('discountType'),
    percentageValue: formData.get('percentageValue') || undefined,
    fixedAmountDisplay: formData.get('fixedAmountDisplay') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid coupon code and discount.' };
  }

  const { createCoupon } = getContainer();
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
  await requireAdmin();
  const parsed = SetCouponActiveSchema.safeParse({
    id: formData.get('id'),
    isActive: formData.get('isActive'),
  });
  if (!parsed.success) return { error: 'Missing coupon.' };

  const { setCouponActive } = getContainer();
  const isActive = parsed.data.isActive === 'true';
  await setCouponActive.execute({ id: parsed.data.id, isActive });

  revalidatePath('/admin/coupons');
  return { message: isActive ? 'Coupon reactivated.' : 'Coupon deactivated.' };
}
