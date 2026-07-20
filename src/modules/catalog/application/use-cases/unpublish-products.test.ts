import { describe, expect, it } from 'vitest';

import { UnpublishProducts } from './unpublish-products';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts(failingIds: Set<string>) {
  const updated: { productId: string; status: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async updateStatus(productId, status) {
      if (failingIds.has(productId)) throw new Error('db error');
      updated.push({ productId, status });
    },
  };
  return { repo: repo as ProductRepository, updated };
}

describe('UnpublishProducts', () => {
  it('unpublishes every product and reports zero failures', async () => {
    const { repo, updated } = makeFakeProducts(new Set());

    const result = await new UnpublishProducts(repo).execute({ productIds: ['p1', 'p2'] });

    expect(result).toEqual({ unpublished: 2, failed: 0 });
    expect(updated).toEqual([
      { productId: 'p1', status: 'draft' },
      { productId: 'p2', status: 'draft' },
    ]);
  });

  it('continues past a failure and counts it separately', async () => {
    const { repo } = makeFakeProducts(new Set(['p2']));

    const result = await new UnpublishProducts(repo).execute({ productIds: ['p1', 'p2', 'p3'] });

    expect(result).toEqual({ unpublished: 2, failed: 1 });
  });

  it('does nothing for an empty id list', async () => {
    const { repo } = makeFakeProducts(new Set());

    const result = await new UnpublishProducts(repo).execute({ productIds: [] });

    expect(result).toEqual({ unpublished: 0, failed: 0 });
  });
});
