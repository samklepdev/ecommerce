import { describe, expect, it } from 'vitest';

import { ListProducts } from './list-products';
import type { Product } from '@/modules/catalog/domain/product';
import type {
  ListProductsParams,
  ProductRepository,
} from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts(items: Product[], total: number) {
  const listCalls: (ListProductsParams | undefined)[] = [];
  const countCalls: (Pick<ListProductsParams, 'search' | 'category'> | undefined)[] = [];
  const repo: Partial<ProductRepository> = {
    async list(params) {
      listCalls.push(params);
      return items;
    },
    async count(params) {
      countCalls.push(params);
      return total;
    },
  };
  return { repo: repo as ProductRepository, listCalls, countCalls };
}

describe('ListProducts', () => {
  it('returns items and total, forwarding search/category/limit/offset to the repository', async () => {
    const { repo, listCalls, countCalls } = makeFakeProducts([], 42);

    const result = await new ListProducts(repo).execute({
      search: 'widget',
      category: 'gadgets',
      limit: 10,
      offset: 20,
    });

    expect(result.total).toBe(42);
    expect(listCalls).toEqual([{ search: 'widget', category: 'gadgets', limit: 10, offset: 20 }]);
    expect(countCalls).toEqual([{ search: 'widget', category: 'gadgets' }]);
  });

  it('returns the repository items verbatim', async () => {
    const fakeItems = [{ id: '1' }] as unknown as Product[];
    const { repo } = makeFakeProducts(fakeItems, 1);

    const result = await new ListProducts(repo).execute({});

    expect(result.items).toBe(fakeItems);
  });
});
