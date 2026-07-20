import { describe, expect, it } from 'vitest';

import { CreateProductVariant } from './create-product-variant';
import type { ProductVariant } from '@/modules/catalog/domain/product-variant';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts() {
  const created: ProductVariant[] = [];
  const repo: Partial<ProductRepository> = {
    async createVariant(variant) {
      created.push(variant);
    },
  };
  return { repo: repo as ProductRepository, created };
}

describe('CreateProductVariant', () => {
  it('creates a variant with the given price', async () => {
    const { repo, created } = makeFakeProducts();

    const variant = await new CreateProductVariant(repo).execute({
      productId: 'prod-1',
      sku: 'SKU-1',
      name: 'Default',
      unitAmountMinor: 1999,
      currency: 'USD',
    });

    expect(variant.price.amountMinor).toBe(1999);
    expect(variant.price.currency).toBe('USD');
    expect(created).toEqual([variant]);
  });

  it('throws when the amount is not an integer minor-unit value', async () => {
    const { repo, created } = makeFakeProducts();

    await expect(
      new CreateProductVariant(repo).execute({
        productId: 'prod-1',
        sku: 'SKU-1',
        name: 'Default',
        unitAmountMinor: 19.99,
        currency: 'USD',
      }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('throws on an invalid currency code', async () => {
    const { repo } = makeFakeProducts();

    await expect(
      new CreateProductVariant(repo).execute({
        productId: 'prod-1',
        sku: 'SKU-1',
        name: 'Default',
        unitAmountMinor: 1999,
        currency: 'US',
      }),
    ).rejects.toThrow();
  });
});
