import { describe, expect, it } from 'vitest';

import { GetProduct } from './get-product';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

describe('GetProduct', () => {
  it('delegates to the repository', async () => {
    const repo: Partial<ProductRepository> = {
      async findById(productId) {
        return { id: productId } as Product;
      },
    };

    const result = await new GetProduct(repo as ProductRepository).execute({
      productId: 'product-1',
    });

    expect(result?.id).toBe('product-1');
  });

  it('returns null when the repository finds nothing', async () => {
    const repo: Partial<ProductRepository> = {
      async findById() {
        return null;
      },
    };

    const result = await new GetProduct(repo as ProductRepository).execute({
      productId: 'missing',
    });

    expect(result).toBeNull();
  });
});
