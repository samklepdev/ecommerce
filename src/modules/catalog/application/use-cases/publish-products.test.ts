import { describe, expect, it } from 'vitest';

import { PublishProducts } from './publish-products';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';

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

/** Every product has a supplier offer unless its id is in `unsourcedIds`. */
function makeFakeOffers(unsourcedIds: Set<string> = new Set()) {
  const repo: Partial<SupplierOfferRepository> = {
    async findSourceableByProductId(productId) {
      if (unsourcedIds.has(productId)) return null;
      return { id: `offer-${productId}`, productId } as SupplierOffer;
    },
  };
  return repo as SupplierOfferRepository;
}

describe('PublishProducts', () => {
  it('publishes every product and reports zero failures', async () => {
    const { repo, updated } = makeFakeProducts(new Set());

    const result = await new PublishProducts(repo, makeFakeOffers()).execute({
      productIds: ['p1', 'p2'],
    });

    expect(result).toEqual({ published: 2, failed: 0, unsourced: 0 });
    expect(updated).toEqual([
      { productId: 'p1', status: 'active' },
      { productId: 'p2', status: 'active' },
    ]);
  });

  it('continues past a failure and counts it separately, not stopping the batch', async () => {
    const { repo, updated } = makeFakeProducts(new Set(['p2']));

    const result = await new PublishProducts(repo, makeFakeOffers()).execute({
      productIds: ['p1', 'p2', 'p3'],
    });

    expect(result).toEqual({ published: 2, failed: 1, unsourced: 0 });
    expect(updated).toEqual([
      { productId: 'p1', status: 'active' },
      { productId: 'p3', status: 'active' },
    ]);
  });

  it('reports all failed when every product errors', async () => {
    const { repo } = makeFakeProducts(new Set(['p1', 'p2']));

    const result = await new PublishProducts(repo, makeFakeOffers()).execute({
      productIds: ['p1', 'p2'],
    });

    expect(result).toEqual({ published: 0, failed: 2, unsourced: 0 });
  });

  it('does nothing for an empty id list', async () => {
    const { repo } = makeFakeProducts(new Set());

    const result = await new PublishProducts(repo, makeFakeOffers()).execute({ productIds: [] });

    expect(result).toEqual({ published: 0, failed: 0, unsourced: 0 });
  });

  it('refuses to publish a product with no supplier offer', async () => {
    const { repo, updated } = makeFakeProducts(new Set());

    const result = await new PublishProducts(repo, makeFakeOffers(new Set(['p2']))).execute({
      productIds: ['p1', 'p2'],
    });

    // p2 is left in draft: an active product with nowhere to buy it from is
    // one a customer can pay for in bitcoin before anyone notices.
    expect(result).toEqual({ published: 1, failed: 0, unsourced: 1 });
    expect(updated).toEqual([{ productId: 'p1', status: 'active' }]);
  });

  it('counts an unsourced product as unsourced, not as a failure', async () => {
    const { repo } = makeFakeProducts(new Set());

    const result = await new PublishProducts(repo, makeFakeOffers(new Set(['p1']))).execute({
      productIds: ['p1'],
    });

    expect(result.failed).toBe(0);
    expect(result.unsourced).toBe(1);
  });
});