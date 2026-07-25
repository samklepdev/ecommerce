'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { requireUser } from '@/app/lib/session';

const SubmitReviewSchema = z.object({
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  authorDisplayName: z.string().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().min(1),
});

export interface SubmitReviewActionResult {
  message?: string;
  error?: string;
}

export async function submitReviewAction(
  _prevState: SubmitReviewActionResult | undefined,
  formData: FormData,
): Promise<SubmitReviewActionResult> {
  const user = await requireUser();
  const parsed = SubmitReviewSchema.safeParse({
    productId: formData.get('productId'),
    productSlug: formData.get('productSlug'),
    authorDisplayName: formData.get('authorDisplayName') || undefined,
    rating: formData.get('rating'),
    title: formData.get('title') || undefined,
    body: formData.get('body'),
  });
  if (!parsed.success) return { error: 'Enter a rating (1-5) and a review.' };

  const { submitReview } = getContainer();
  const result = await submitReview.execute({
    productId: parsed.data.productId,
    userId: user.id,
    authorDisplayName: parsed.data.authorDisplayName?.trim() || 'Anonymous',
    rating: parsed.data.rating,
    title: parsed.data.title,
    body: parsed.data.body,
  });

  if (isErr(result)) {
    return {
      error:
        result.error.code === 'already_reviewed'
          ? 'You’ve already reviewed this product.'
          : 'This product could not be found.',
    };
  }

  revalidatePath(`/products/${parsed.data.productSlug}`);
  return { message: 'Thanks! Your review is awaiting approval.' };
}
