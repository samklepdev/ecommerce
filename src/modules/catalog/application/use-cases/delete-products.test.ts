import { describe, expect, it } from 'vitest';

import { DeleteProducts } from './delete-products';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts(failingIds: Set<string>) {
  const deletedIds: string[] = [];
  const repo: Partial<ProductRepository> = {
    async deleteProduct(productId) {
      if (failingIds.has(productId)) throw new Error('FK restrict: product has real order history');
      deletedIds.push(productId);
    },
  };
  return { repo: repo as ProductRepository, deletedIds };
}

describe('DeleteProducts', () => {
  it('deletes every product and reports zero failures', async () => {
    const { repo, deletedIds } = makeFakeProducts(new Set());

    const result = await new DeleteProducts(repo).execute({ productIds: ['p1', 'p2'] });

    expect(result).toEqual({ deleted: 2, failed: 0 });
    expect(deletedIds).toEqual(['p1', 'p2']);
  });

  it('continues past a product that cannot be deleted (e.g. has real order history)', async () => {
    const { repo, deletedIds } = makeFakeProducts(new Set(['p2']));

    const result = await new DeleteProducts(repo).execute({ productIds: ['p1', 'p2', 'p3'] });

    expect(result).toEqual({ deleted: 2, failed: 1 });
    expect(deletedIds).toEqual(['p1', 'p3']);
  });

  it('does nothing for an empty id list', async () => {
    const { repo } = makeFakeProducts(new Set());

    const result = await new DeleteProducts(repo).execute({ productIds: [] });

    expect(result).toEqual({ deleted: 0, failed: 0 });
  });
});
