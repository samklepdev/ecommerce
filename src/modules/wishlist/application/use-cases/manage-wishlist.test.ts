import { describe, expect, it } from 'vitest';

import { ListWishlist, ToggleWishlistItem, GetSavedProductIds } from './manage-wishlist';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type {
  WishlistEntry,
  WishlistRepository,
} from '@/modules/wishlist/application/ports/wishlist-repository';

function makeProduct(id: string) {
  return Product.create({
    id,
    slug: Slug.create(`product-${id}`),
    name: `Product ${id}`,
    description: null,
    status: 'active',
    sku: `SKU-${id}`,
    price: Money.of(1000, 'USD'),
  });
}

function makeFakeWishlist(entries: WishlistEntry[] = []) {
  const state = [...entries];
  const repo: WishlistRepository = {
    async listByUser() {
      return [...state].sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
    },
    async add(_userId, productId) {
      if (!state.some((e) => e.productId === productId)) {
        state.push({ productId, savedAt: new Date() });
      }
    },
    async remove(_userId, productId) {
      const i = state.findIndex((e) => e.productId === productId);
      if (i >= 0) state.splice(i, 1);
    },
    async savedProductIds(_userId, productIds) {
      return new Set(state.filter((e) => productIds.includes(e.productId)).map((e) => e.productId));
    },
  };
  return { repo, state };
}

/** Active-only, mirroring the real `findByIds`. */
function makeFakeProducts(products: Product[]) {
  const repo: Partial<ProductRepository> = {
    async findByIds(ids) {
      return products.filter((p) => ids.includes(p.id));
    },
  };
  return repo as ProductRepository;
}

describe('ToggleWishlistItem', () => {
  it('saves a product that was not saved', async () => {
    const { repo, state } = makeFakeWishlist();

    const result = await new ToggleWishlistItem(repo).execute({
      userId: 'u1',
      productId: 'p1',
    });

    expect(result.saved).toBe(true);
    expect(state.map((e) => e.productId)).toEqual(['p1']);
  });

  it('removes one that was', async () => {
    const { repo, state } = makeFakeWishlist([{ productId: 'p1', savedAt: new Date() }]);

    const result = await new ToggleWishlistItem(repo).execute({
      userId: 'u1',
      productId: 'p1',
    });

    expect(result.saved).toBe(false);
    expect(state).toHaveLength(0);
  });

  // The button reads its own state rather than trusting a flag from a page
  // that may be stale, so a double-submit lands somewhere predictable.
  it('is a straight toggle, so two presses return to the start', async () => {
    const { repo, state } = makeFakeWishlist();
    const toggle = new ToggleWishlistItem(repo);

    await toggle.execute({ userId: 'u1', productId: 'p1' });
    await toggle.execute({ userId: 'u1', productId: 'p1' });

    expect(state).toHaveLength(0);
  });
});

describe('ListWishlist', () => {
  it('returns saved products newest first', async () => {
    const { repo } = makeFakeWishlist([
      { productId: 'p1', savedAt: new Date('2026-07-01') },
      { productId: 'p2', savedAt: new Date('2026-07-20') },
    ]);
    const products = makeFakeProducts([makeProduct('p1'), makeProduct('p2')]);

    const items = await new ListWishlist(repo, products).execute({ userId: 'u1' });

    expect(items.map((i) => i.product.id)).toEqual(['p2', 'p1']);
  });

  // findByIds is active-only. A product pulled from the catalog shouldn't
  // render as a buyable card — but the row stays, because it may come back.
  it('hides a saved product that is no longer purchasable', async () => {
    const { repo, state } = makeFakeWishlist([
      { productId: 'p1', savedAt: new Date() },
      { productId: 'archived', savedAt: new Date() },
    ]);
    const products = makeFakeProducts([makeProduct('p1')]);

    const items = await new ListWishlist(repo, products).execute({ userId: 'u1' });

    expect(items.map((i) => i.product.id)).toEqual(['p1']);
    expect(state).toHaveLength(2);
  });

  it('does not query the catalog for an empty wishlist', async () => {
    const { repo } = makeFakeWishlist();
    let called = false;
    const products = {
      async findByIds() {
        called = true;
        return [];
      },
    } as unknown as ProductRepository;

    expect(await new ListWishlist(repo, products).execute({ userId: 'u1' })).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('GetSavedProductIds', () => {
  it('answers for a page of products in one call', async () => {
    const { repo } = makeFakeWishlist([{ productId: 'p2', savedAt: new Date() }]);

    const saved = await new GetSavedProductIds(repo).execute({
      userId: 'u1',
      productIds: ['p1', 'p2', 'p3'],
    });

    expect([...saved]).toEqual(['p2']);
  });

  it('short-circuits on an empty page', async () => {
    const { repo } = makeFakeWishlist();
    const saved = await new GetSavedProductIds(repo).execute({ userId: 'u1', productIds: [] });
    expect(saved.size).toBe(0);
  });
});
