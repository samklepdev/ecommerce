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

  // findByIds does not preserve input order — re-sort to match the
  // caller's requested (most-recent-first) order.
  const productsById = new Map(products.map((product) => [product.id, product]));
  const ordered = parsed.data
    .map((id) => productsById.get(id))
    .filter((product): product is (typeof products)[number] => product !== undefined);

  return ordered.map(toProductCardSummary);
}
