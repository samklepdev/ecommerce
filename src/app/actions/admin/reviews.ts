'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';

const ReviewIdSchema = z.object({
  id: z.string().min(1),
});

/**
 * Routine moderation, and deliberately **not** audit-logged.
 *
 * The log isn't a record of everything an admin touches — it covers actions
 * that are irreversible, change money, or change privileges. Approving a
 * review is none of those: it's reversible content state, in the same class
 * as `publishProductsAction`/`unpublishProductsAction` and product images,
 * which are also unlogged. Coupons, by contrast, *are* logged, because a
 * coupon changes what a customer is charged.
 *
 * (An earlier version of this note said the log stayed scoped to "the
 * curated ~7 actions". It's 26 now — the principle held while the count
 * didn't, so the count is gone.)
 *
 * Plain void action (no `useActionState`) so it drops straight into a
 * server-rendered `<form>`, same as `cancelSupplierOrderAction`.
 */
export async function approveReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = ReviewIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  const { approveReview } = getContainer();
  await approveReview.execute({ id: parsed.data.id });
  revalidatePath('/admin/reviews');
}

export async function rejectReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = ReviewIdSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return;

  const { rejectReview } = getContainer();
  await rejectReview.execute({ id: parsed.data.id });
  revalidatePath('/admin/reviews');
}
