'use server';

import { z } from 'zod';

import { getContainer } from '@/composition/container';
import { toProductCardSummary, type ProductCardSummary } from '@/app/(storefront)/products/ProductCardMini';

const GetRecentlyViewedSchema = z.array(z.string().min(1)).max(8);

export async function getRecentlyViewedProductsAction(
  productIds: string[],
): Promise<ProductCardSummary[]> {
  const parsed = GetRecentlyViewedSchema.safeParse(productIds);
  if (!parsed.success) return [];

  const { getProductsByIds } = getContainer();
  const products = await getProductsByIds.execute({ productIds: parsed.data });
  return products.map(toProductCardSummary);
}
