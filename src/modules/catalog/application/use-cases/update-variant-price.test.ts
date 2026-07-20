import { describe, expect, it } from 'vitest';

import { UpdateVariantPrice } from './update-variant-price';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts() {
  const updated: { variantId: string; amountMinor: number; currency: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async updateVariantPrice(variantId, amountMinor, currency) {
      updated.push({ variantId, amountMinor, currency });
    },
  };
  return { repo: repo as ProductRepository, updated };
}

describe('UpdateVariantPrice', () => {
  it('updates the variant price with the given amount and currency', async () => {
    const { repo, updated } = makeFakeProducts();

    await new UpdateVariantPrice(repo).execute({ variantId: 'v1', amountMinor: 2499, currency: 'USD' });

    expect(updated).toEqual([{ variantId: 'v1', amountMinor: 2499, currency: 'USD' }]);
  });

  it('throws on a non-integer amount rather than persisting it', async () => {
    const { repo, updated } = makeFakeProducts();

    await expect(
      new UpdateVariantPrice(repo).execute({ variantId: 'v1', amountMinor: 24.99, currency: 'USD' }),
    ).rejects.toThrow('integer minor-unit value');
    expect(updated).toHaveLength(0);
  });

  it('throws on an invalid currency code rather than persisting it', async () => {
    const { repo, updated } = makeFakeProducts();

    await expect(
      new UpdateVariantPrice(repo).execute({ variantId: 'v1', amountMinor: 2499, currency: 'US' }),
    ).rejects.toThrow('3-letter ISO 4217 code');
    expect(updated).toHaveLength(0);
  });
});
