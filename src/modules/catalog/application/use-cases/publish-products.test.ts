import { describe, expect, it } from 'vitest';

import { PublishProducts } from './publish-products';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts(failingIds: Set<string>) {
  const updated: { productId: string; status: string }[] = [];
  const repo: Partial<ProductRepository> = {
    async updateStatus(productId, status) {
      if (failingIds.has(productId)) throw new Error('db restrict');
      updated.push({ productId, status });
    },
  };
  return { repo: repo as ProductRepository, updated };
}

describe('PublishProducts', () => {
  it('publishes every product and reports zero failures', async () => {
    const { repo, updated } = makeFakeProducts(new Set());

    const result = await new PublishProducts(repo).execute({ productIds: ['p1', 'p2'] });

    expect(result).toEqual({ published: 2, failed: 0 });
    expect(updated).toEqual([
      { productId: 'p1', status: 'active' },
      { productId: 'p2', status: 'active' },
    ]);
  });

  it('continues past a failure and counts it separately, not stopping the batch', async () => {
    const { repo, updated } = makeFakeProducts(new Set(['p2']));

    const result = await new PublishProducts(repo).execute({ productIds: ['p1', 'p2', 'p3'] });

    expect(result).toEqual({ published: 2, failed: 1 });
    expect(updated).toEqual([
      { productId: 'p1', status: 'active' },
      { productId: 'p3', status: 'active' },
    ]);
  });

  it('reports all failed when every product errors', async () => {
    const { repo } = makeFakeProducts(new Set(['p1', 'p2']));

    const result = await new PublishProducts(repo).execute({ productIds: ['p1', 'p2'] });

    expect(result).toEqual({ published: 0, failed: 2 });
  });

  it('does nothing for an empty id list', async () => {
    const { repo } = makeFakeProducts(new Set());

    const result = await new PublishProducts(repo).execute({ productIds: [] });

    expect(result).toEqual({ published: 0, failed: 0 });
  });
});
