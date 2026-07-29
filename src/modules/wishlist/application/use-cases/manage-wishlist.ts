import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { WishlistRepository } from '@/modules/wishlist/application/ports/wishlist-repository';

export interface WishlistItem {
  product: Product;
  savedAt: Date;
}

export interface ListWishlistInput {
  userId: string;
}

/**
 * The customer's saved products, hydrated from the catalog.
 *
 * A saved product that has since been archived or unpublished simply drops
 * out: the wishlist shows what can still be bought, and `findByIds` is
 * active-only for exactly that reason. The row stays — the product may come
 * back — so this is a filter on display, not a delete.
 */
export class ListWishlist implements UseCase<ListWishlistInput, WishlistItem[]> {
  constructor(
    private readonly wishlist: WishlistRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(input: ListWishlistInput): Promise<WishlistItem[]> {
    const entries = await this.wishlist.listByUser(input.userId);
    if (entries.length === 0) return [];

    const products = await this.products.findByIds(entries.map((e) => e.productId));
    const productById = new Map(products.map((p) => [p.id, p] as const));

    return entries
      .map((entry) => {
        const product = productById.get(entry.productId);
        return product ? { product, savedAt: entry.savedAt } : null;
      })
      .filter((item): item is WishlistItem => item !== null);
  }
}

export interface ToggleWishlistItemInput {
  userId: string;
  productId: string;
}

export interface ToggleWishlistItemResult {
  saved: boolean;
}

/**
 * One action for both directions, because the UI is one button.
 *
 * Deciding from the current state rather than taking a `saved` flag from the
 * client means a double-submit or a stale page can't drive it out of step
 * with what the customer sees.
 */
export class ToggleWishlistItem
  implements UseCase<ToggleWishlistItemInput, ToggleWishlistItemResult>
{
  constructor(private readonly wishlist: WishlistRepository) {}

  async execute(input: ToggleWishlistItemInput): Promise<ToggleWishlistItemResult> {
    const saved = await this.wishlist.savedProductIds(input.userId, [input.productId]);

    if (saved.has(input.productId)) {
      await this.wishlist.remove(input.userId, input.productId);
      return { saved: false };
    }

    await this.wishlist.add(input.userId, input.productId);
    return { saved: true };
  }
}

export interface GetSavedProductIdsInput {
  userId: string;
  productIds: string[];
}

/** Fills in the heart on a page of product cards. */
export class GetSavedProductIds implements UseCase<GetSavedProductIdsInput, Set<string>> {
  constructor(private readonly wishlist: WishlistRepository) {}

  async execute(input: GetSavedProductIdsInput): Promise<Set<string>> {
    if (input.productIds.length === 0) return new Set();
    return this.wishlist.savedProductIds(input.userId, input.productIds);
  }
}

/** Shared with the Drizzle adapter so both agree on how an id is minted. */
export function newWishlistItemId(): string {
  return randomUUID();
}
