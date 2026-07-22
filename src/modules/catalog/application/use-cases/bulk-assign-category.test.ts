import { describe, expect, it } from 'vitest';

import { BulkAssignCategory } from './bulk-assign-category';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts(failingIds: Set<string>) {
  const updated: { productId: string; category: string | null }[] = [];
  const repo: Partial<ProductRepository> = {
    async updateCategory(productId, category) {
      if (failingIds.has(productId)) throw new Error('db error');
      updated.push({ productId, category });
    },
  };
  return { repo: repo as ProductRepository, updated };
}

describe('BulkAssignCategory', () => {
  it('assigns the category to every product and reports zero failures', async () => {
    const { repo, updated } = makeFakeProducts(new Set());

    const result = await new BulkAssignCategory(repo).execute({
      productIds: ['p1', 'p2'],
      category: 'Widgets',
    });

    expect(result).toEqual({ updated: 2, failed: 0 });
    expect(updated).toEqual([
      { productId: 'p1', category: 'Widgets' },
      { productId: 'p2', category: 'Widgets' },
    ]);
  });

  it('continues past a failure and counts it separately, not stopping the batch', async () => {
    const { repo, updated } = makeFakeProducts(new Set(['p2']));

    const result = await new BulkAssignCategory(repo).execute({
      productIds: ['p1', 'p2', 'p3'],
      category: 'Widgets',
    });

    expect(result).toEqual({ updated: 2, failed: 1 });
    expect(updated).toEqual([
      { productId: 'p1', category: 'Widgets' },
      { productId: 'p3', category: 'Widgets' },
    ]);
  });

  it('allows clearing the category with null', async () => {
    const { repo, updated } = makeFakeProducts(new Set());

    await new BulkAssignCategory(repo).execute({ productIds: ['p1'], category: null });

    expect(updated).toEqual([{ productId: 'p1', category: null }]);
  });

  it('does nothing for an empty id list', async () => {
    const { repo } = makeFakeProducts(new Set());

    const result = await new BulkAssignCategory(repo).execute({ productIds: [], category: 'Widgets' });

    expect(result).toEqual({ updated: 0, failed: 0 });
  });
});
