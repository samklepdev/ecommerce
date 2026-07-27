import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { ApplyMarkupToProducts } from './apply-markup-to-products';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeProduct(id: string, unitAmountMinor: number, currency = 'USD') {
  return Product.create({
    id,
    slug: Slug.create(`widget-${id.slice(0, 4)}`),
    name: 'Widget',
    description: null,
    status: 'active',
    sku: `SKU-${id.slice(0, 4)}`,
    price: Money.of(unitAmountMinor, currency),
  });
}

function makeFakeProducts(productsById: Map<string, Product>) {
  const updated: { productId: string; amountMinor: number; currency: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async findById(productId) {
      return productsById.get(productId) ?? null;
    },
    async updatePrice(productId, amountMinor, currency) {
      updated.push({ productId, amountMinor, currency });
    },
  };
  return { repo: repo as ProductRepository, updated };
}

describe('ApplyMarkupToProducts', () => {
  it('increases each product price by the given percentage on top of its current price', async () => {
    const productA = randomUUID();
    const productB = randomUUID();
    const { repo, updated } = makeFakeProducts(
      new Map([
        [productA, makeProduct(productA, 1000)],
        [productB, makeProduct(productB, 2000)],
      ]),
    );

    const result = await new ApplyMarkupToProducts(repo).execute({
      productIds: [productA, productB],
      markupPercent: 10,
    });

    expect(result).toEqual({ updated: 2, failed: 0 });
    expect(updated).toEqual([
      { productId: productA, amountMinor: 1100, currency: 'USD' },
      { productId: productB, amountMinor: 2200, currency: 'USD' },
    ]);
  });

  it('rounds to the nearest minor unit', async () => {
    const productA = randomUUID();
    const { repo, updated } = makeFakeProducts(new Map([[productA, makeProduct(productA, 999)]]));

    await new ApplyMarkupToProducts(repo).execute({ productIds: [productA], markupPercent: 15 });

    // 999 * 1.15 = 1148.85 -> rounds to 1149
    expect(updated[0]?.amountMinor).toBe(1149);
  });

  it('counts a product that no longer exists as failed, without stopping the batch', async () => {
    const productA = randomUUID();
    const missingProduct = randomUUID();
    const { repo, updated } = makeFakeProducts(new Map([[productA, makeProduct(productA, 1000)]]));

    const result = await new ApplyMarkupToProducts(repo).execute({
      productIds: [missingProduct, productA],
      markupPercent: 10,
    });

    expect(result).toEqual({ updated: 1, failed: 1 });
    expect(updated).toEqual([{ productId: productA, amountMinor: 1100, currency: 'USD' }]);
  });

  it('keeps the product currency rather than assuming one', async () => {
    const productA = randomUUID();
    const { repo, updated } = makeFakeProducts(
      new Map([[productA, makeProduct(productA, 1000, 'EUR')]]),
    );

    await new ApplyMarkupToProducts(repo).execute({ productIds: [productA], markupPercent: 10 });

    expect(updated[0]?.currency).toBe('EUR');
  });

  it('does nothing for an empty selection', async () => {
    const { repo } = makeFakeProducts(new Map());

    const result = await new ApplyMarkupToProducts(repo).execute({
      productIds: [],
      markupPercent: 10,
    });

    expect(result).toEqual({ updated: 0, failed: 0 });
  });
});
