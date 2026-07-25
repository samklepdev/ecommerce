'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';

const ReviewIdSchema = z.object({
  id: z.string().min(1),
});

/** Routine moderation, same as product publish/unpublish — not
 * audit-logged (the audit log stays scoped to the curated ~7 actions).
 * Plain void action (no `useActionState`) so it drops straight into a
 * server-rendered `<form>`, same as `cancelSupplierOrderAction`. */
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
