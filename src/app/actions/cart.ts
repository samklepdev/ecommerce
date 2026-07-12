'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isErr } from '@/shared/domain/result';
import { resolveCartOwner } from '@/app/lib/session';

const AddToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export async function addToCartAction(formData: FormData): Promise<void> {
  const parsed = AddToCartSchema.safeParse({
    variantId: formData.get('variantId'),
    quantity: formData.get('quantity') ?? 1,
  });
  if (!parsed.success) return;

  const owner = await resolveCartOwner();
  const { addToCart } = getContainer();
  const result = await addToCart.execute({ owner, ...parsed.data });
  if (isErr(result)) return;

  revalidatePath('/cart');
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const variantId = String(formData.get('variantId') ?? '');
  if (!variantId) return;

  const owner = await resolveCartOwner();
  const { removeFromCart } = getContainer();
  await removeFromCart.execute({ owner, variantId });

  revalidatePath('/cart');
}
