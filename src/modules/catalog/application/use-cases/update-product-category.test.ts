import { describe, expect, it } from 'vitest';

import { UpdateProductCategory } from './update-product-category';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

describe('UpdateProductCategory', () => {
  it('delegates to the repository', async () => {
    const calls: { productId: string; category: string | null }[] = [];
    const repo: Partial<ProductRepository> = {
      async updateCategory(productId, category) {
        calls.push({ productId, category });
      },
    };

    await new UpdateProductCategory(repo as ProductRepository).execute({
      productId: 'p1',
      category: 'Widgets',
    });

    expect(calls).toEqual([{ productId: 'p1', category: 'Widgets' }]);
  });

  it('allows clearing the category with null', async () => {
    const calls: (string | null)[] = [];
    const repo: Partial<ProductRepository> = {
      async updateCategory(_productId, category) {
        calls.push(category);
      },
    };

    await new UpdateProductCategory(repo as ProductRepository).execute({
      productId: 'p1',
      category: null,
    });

    expect(calls).toEqual([null]);
  });
});
