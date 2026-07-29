'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';

const ToggleSchema = z.object({ productId: z.string().min(1) });

export interface ToggleWishlistActionResult {
  saved?: boolean;
  error?: string;
}

/**
 * Saving is for signed-in customers only. A wishlist keyed to a guest cookie
 * would quietly empty itself when the cookie expired, which is worse than
 * not offering one — so an anonymous visitor gets told to sign in rather
 * than getting a list that forgets.
 */
export async function toggleWishlistItemAction(
  _prevState: ToggleWishlistActionResult | undefined,
  formData: FormData,
): Promise<ToggleWishlistActionResult> {
  const user = await getSessionUser();
  if (!user) return { error: 'Sign in to save products.' };

  const parsed = ToggleSchema.safeParse({ productId: formData.get('productId') });
  if (!parsed.success) return { error: 'Could not save that product.' };

  const { toggleWishlistItem } = getContainer();
  const result = await toggleWishlistItem.execute({
    userId: user.id,
    productId: parsed.data.productId,
  });

  revalidatePath('/account/wishlist');
  return { saved: result.saved };
}
