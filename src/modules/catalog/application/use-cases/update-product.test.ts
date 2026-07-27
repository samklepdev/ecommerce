import { describe, expect, it } from 'vitest';

import { UpdateProduct } from './update-product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts() {
  const calls: string[] = [];
  const details: { productId: string; name: string; description: string | null }[] = [];
  const categories: { productId: string; category: string | null }[] = [];
  const prices: { productId: string; amountMinor: number; currency: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async updateDetails(productId, d) {
      calls.push('details');
      details.push({ productId, ...d });
    },
    async updateCategory(productId, category) {
      calls.push('category');
      categories.push({ productId, category });
    },
    async updatePrice(productId, amountMinor, currency) {
      calls.push('price');
      prices.push({ productId, amountMinor, currency });
    },
  };
  return { repo: repo as ProductRepository, calls, details, categories, prices };
}

const input = {
  productId: 'p1',
  name: 'Widget X',
  description: 'A widget.',
  category: 'Widgets',
  amountMinor: 2499,
  currency: 'USD',
};

describe('UpdateProduct', () => {
  it('saves details, category and price together', async () => {
    const { repo, details, categories, prices } = makeFakeProducts();

    await new UpdateProduct(repo).execute(input);

    expect(details).toEqual([{ productId: 'p1', name: 'Widget X', description: 'A widget.' }]);
    expect(categories).toEqual([{ productId: 'p1', category: 'Widgets' }]);
    expect(prices).toEqual([{ productId: 'p1', amountMinor: 2499, currency: 'USD' }]);
  });

  it('accepts a cleared description and category as null', async () => {
    const { repo, details, categories } = makeFakeProducts();

    await new UpdateProduct(repo).execute({ ...input, description: null, category: null });

    expect(details[0]?.description).toBeNull();
    expect(categories[0]?.category).toBeNull();
  });

  // The whole point of one Save button is that it's one save. A price that
  // fails validation must not leave the name already written.
  it('validates the price before writing anything', async () => {
    const { repo, calls } = makeFakeProducts();

    await expect(
      new UpdateProduct(repo).execute({ ...input, amountMinor: 24.99 }),
    ).rejects.toThrow(/integer minor-unit/);
    expect(calls).toEqual([]);
  });

  it('rejects a bad currency before writing anything', async () => {
    const { repo, calls } = makeFakeProducts();

    await expect(new UpdateProduct(repo).execute({ ...input, currency: 'US' })).rejects.toThrow(
      /ISO 4217/,
    );
    expect(calls).toEqual([]);
  });

  it('rejects an empty name before writing anything', async () => {
    const { repo, calls } = makeFakeProducts();

    await expect(new UpdateProduct(repo).execute({ ...input, name: '   ' })).rejects.toThrow(
      /name/i,
    );
    expect(calls).toEqual([]);
  });
});
