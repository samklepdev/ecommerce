import { describe, expect, it } from 'vitest';

import { GetProductsByIds } from './get-products-by-ids';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { Product } from '@/modules/catalog/domain/product';

describe('GetProductsByIds', () => {
  it('returns an empty array without querying the repository when given no ids', async () => {
    let called = false;
    const repo: Partial<ProductRepository> = {
      async findByIds() {
        called = true;
        return [];
      },
    };

    const result = await new GetProductsByIds(repo as ProductRepository).execute({ productIds: [] });

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it('delegates to the repository for a normal id list', async () => {
    const repo: Partial<ProductRepository> = {
      async findByIds(ids) {
        return ids.map((id) => ({ id }) as Product);
      },
    };

    const result = await new GetProductsByIds(repo as ProductRepository).execute({
      productIds: ['a', 'b'],
    });

    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('caps the id list at 8 before querying the repository', async () => {
    let received: string[] = [];
    const repo: Partial<ProductRepository> = {
      async findByIds(ids) {
        received = ids;
        return [];
      },
    };
    const tooMany = Array.from({ length: 10 }, (_, i) => `id-${i}`);

    await new GetProductsByIds(repo as ProductRepository).execute({ productIds: tooMany });

    expect(received).toHaveLength(8);
  });
});
