import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { ApplyMarkupToVariants } from './apply-markup-to-variants';
import { ProductVariant } from '@/modules/catalog/domain/product-variant';
import { Money } from '@/shared/domain/money';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeVariant(id: string, unitAmountMinor: number, currency = 'USD') {
  return ProductVariant.create({
    id,
    productId: randomUUID(),
    sku: `SKU-${id.slice(0, 4)}`,
    name: 'Default',
    price: Money.of(unitAmountMinor, currency),
  });
}

function makeFakeProducts(variantsById: Map<string, ProductVariant>) {
  const updated: { variantId: string; amountMinor: number; currency: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async findVariantById(variantId) {
      return variantsById.get(variantId) ?? null;
    },
    async updateVariantPrice(variantId, amountMinor, currency) {
      updated.push({ variantId, amountMinor, currency });
    },
  };
  return { repo: repo as ProductRepository, updated };
}

describe('ApplyMarkupToVariants', () => {
  it('increases each variant price by the given percentage on top of its current price', async () => {
    const variantA = randomUUID();
    const variantB = randomUUID();
    const { repo, updated } = makeFakeProducts(
      new Map([
        [variantA, makeVariant(variantA, 1000)],
        [variantB, makeVariant(variantB, 2000)],
      ]),
    );

    const result = await new ApplyMarkupToVariants(repo).execute({
      variantIds: [variantA, variantB],
      markupPercent: 10,
    });

    expect(result).toEqual({ updated: 2, failed: 0 });
    expect(updated).toEqual([
      { variantId: variantA, amountMinor: 1100, currency: 'USD' },
      { variantId: variantB, amountMinor: 2200, currency: 'USD' },
    ]);
  });

  it('rounds to the nearest minor unit', async () => {
    const variantA = randomUUID();
    const { repo, updated } = makeFakeProducts(new Map([[variantA, makeVariant(variantA, 999)]]));

    await new ApplyMarkupToVariants(repo).execute({ variantIds: [variantA], markupPercent: 15 });

    // 999 * 1.15 = 1148.85 -> rounds to 1149
    expect(updated[0]?.amountMinor).toBe(1149);
  });

  it('counts a variant that no longer exists as failed, without stopping the batch', async () => {
    const variantA = randomUUID();
    const missingVariant = randomUUID();
    const { repo, updated } = makeFakeProducts(new Map([[variantA, makeVariant(variantA, 1000)]]));

    const result = await new ApplyMarkupToVariants(repo).execute({
      variantIds: [missingVariant, variantA],
      markupPercent: 10,
    });

    expect(result).toEqual({ updated: 1, failed: 1 });
    expect(updated).toEqual([{ variantId: variantA, amountMinor: 1100, currency: 'USD' }]);
  });

  it('does nothing for an empty selection', async () => {
    const { repo } = makeFakeProducts(new Map());

    const result = await new ApplyMarkupToVariants(repo).execute({ variantIds: [], markupPercent: 10 });

    expect(result).toEqual({ updated: 0, failed: 0 });
  });
});
