import { describe, expect, it } from 'vitest';

import { UpdateProductPrice } from './update-product-price';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts() {
  const updated: { productId: string; amountMinor: number; currency: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async updatePrice(productId, amountMinor, currency) {
      updated.push({ productId, amountMinor, currency });
    },
  };
  return { repo: repo as ProductRepository, updated };
}

describe('UpdateProductPrice', () => {
  it('updates the product price with the given amount and currency', async () => {
    const { repo, updated } = makeFakeProducts();

    await new UpdateProductPrice(repo).execute({
      productId: 'p1',
      amountMinor: 2499,
      currency: 'USD',
    });

    expect(updated).toEqual([{ productId: 'p1', amountMinor: 2499, currency: 'USD' }]);
  });

  it('throws on a non-integer amount rather than persisting it', async () => {
    const { repo, updated } = makeFakeProducts();

    await expect(
      new UpdateProductPrice(repo).execute({ productId: 'p1', amountMinor: 24.99, currency: 'USD' }),
    ).rejects.toThrow('integer minor-unit value');
    expect(updated).toHaveLength(0);
  });

  it('throws on an invalid currency code rather than persisting it', async () => {
    const { repo, updated } = makeFakeProducts();

    await expect(
      new UpdateProductPrice(repo).execute({ productId: 'p1', amountMinor: 2499, currency: 'US' }),
    ).rejects.toThrow('3-letter ISO 4217 code');
    expect(updated).toHaveLength(0);
  });
});
