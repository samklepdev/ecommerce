import { describe, expect, it } from 'vitest';

import { GetProductForVariant } from './get-product-for-variant';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

describe('GetProductForVariant', () => {
  it('delegates to the repository', async () => {
    const repo: Partial<ProductRepository> = {
      async findProductByVariantId(variantId) {
        return { id: `product-for-${variantId}` } as Product;
      },
    };

    const result = await new GetProductForVariant(repo as ProductRepository).execute({
      variantId: 'variant-1',
    });

    expect(result?.id).toBe('product-for-variant-1');
  });

  it('returns null when the repository finds nothing', async () => {
    const repo: Partial<ProductRepository> = {
      async findProductByVariantId() {
        return null;
      },
    };

    const result = await new GetProductForVariant(repo as ProductRepository).execute({
      variantId: 'missing',
    });

    expect(result).toBeNull();
  });
});
