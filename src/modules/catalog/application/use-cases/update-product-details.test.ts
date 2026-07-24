import { describe, expect, it } from 'vitest';

import { UpdateProductDetails } from './update-product-details';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

describe('UpdateProductDetails', () => {
  it('delegates to the repository', async () => {
    const calls: { productId: string; name: string; description: string | null }[] = [];
    const repo: Partial<ProductRepository> = {
      async updateDetails(productId, details) {
        calls.push({ productId, ...details });
      },
    };

    await new UpdateProductDetails(repo as ProductRepository).execute({
      productId: 'p1',
      name: 'New Name',
      description: 'New description',
    });

    expect(calls).toEqual([{ productId: 'p1', name: 'New Name', description: 'New description' }]);
  });

  it('allows clearing the description with null', async () => {
    const calls: (string | null)[] = [];
    const repo: Partial<ProductRepository> = {
      async updateDetails(_productId, details) {
        calls.push(details.description);
      },
    };

    await new UpdateProductDetails(repo as ProductRepository).execute({
      productId: 'p1',
      name: 'Name',
      description: null,
    });

    expect(calls).toEqual([null]);
  });
});
