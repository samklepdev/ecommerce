'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { isStoreOpen, STORE_CLOSED_MESSAGE } from '@/app/lib/store-open';
import { isErr } from '@/shared/domain/result';
import { resolveCartOwner } from '@/app/lib/session';
import { MAX_CART_LINE_QUANTITY } from '@/modules/cart/domain/cart-line';

const AddToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(MAX_CART_LINE_QUANTITY),
});

export interface AddToCartActionResult {
  message?: string;
  error?: string;
}

export async function addToCartAction(
  _prevState: AddToCartActionResult | undefined,
  formData: FormData,
): Promise<AddToCartActionResult> {
  if (!(await isStoreOpen())) return { error: STORE_CLOSED_MESSAGE };
  const parsed = AddToCartSchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity') ?? 1,
  });
  if (!parsed.success) return { error: 'Could not add to cart.' };

  const owner = await resolveCartOwner();
  const { addToCart } = getContainer();
  const result = await addToCart.execute({ owner, ...parsed.data });
  if (isErr(result)) return { error: 'That item is no longer available.' };

  revalidatePath('/cart');
  // The cart item-count badge lives in the root layout (Header), which the
  // client router cache otherwise keeps stale across navigations until a
  // full reload — revalidate it explicitly whenever cart contents change.
  revalidatePath('/', 'layout');
  return { message: 'Added to cart.' };
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  // No result type to report through, so a closed store is a no-op rather
  // than a silent write. The page the form sits on already shows the paused
  // notice; this only matters for a direct POST.
  if (!(await isStoreOpen())) return;

  const productId = String(formData.get('productId') ?? '');
  if (!productId) return;

  const owner = await resolveCartOwner();
  const { removeFromCart } = getContainer();
  await removeFromCart.execute({ owner, productId });

  revalidatePath('/cart');
  // The cart item-count badge lives in the root layout (Header), which the
  // client router cache otherwise keeps stale across navigations until a
  // full reload — revalidate it explicitly whenever cart contents change.
  revalidatePath('/', 'layout');
}

const UpdateCartLineQuantitySchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(MAX_CART_LINE_QUANTITY),
});

export async function updateCartLineQuantityAction(formData: FormData): Promise<void> {
  // No result type to report through, so a closed store is a no-op rather
  // than a silent write. The page the form sits on already shows the paused
  // notice; this only matters for a direct POST.
  if (!(await isStoreOpen())) return;

  const parsed = UpdateCartLineQuantitySchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity'),
  });
  if (!parsed.success) return;

  const owner = await resolveCartOwner();
  const { updateCartLineQuantity } = getContainer();
  await updateCartLineQuantity.execute({ owner, ...parsed.data });

  revalidatePath('/cart');
  // The cart item-count badge lives in the root layout (Header), which the
  // client router cache otherwise keeps stale across navigations until a
  // full reload — revalidate it explicitly whenever cart contents change.
  revalidatePath('/', 'layout');
}
