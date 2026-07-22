import { describe, expect, it } from 'vitest';

import { CreateProduct } from './create-product';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

function makeFakeProducts() {
  const created: Product[] = [];
  const repo: Partial<ProductRepository> = {
    async createProduct(product) {
      created.push(product);
    },
  };
  return { repo: repo as ProductRepository, created };
}

describe('CreateProduct', () => {
  it('creates a product with defaulted status and source', async () => {
    const { repo, created } = makeFakeProducts();

    const product = await new CreateProduct(repo).execute({ slug: 'widget-x', name: 'Widget X' });

    expect(product.status).toBe('active');
    expect(product.source).toBe('manual');
    expect(product.slug.value).toBe('widget-x');
    expect(created).toEqual([product]);
  });

  it('honors explicit status and source when given', async () => {
    const { repo } = makeFakeProducts();

    const product = await new CreateProduct(repo).execute({
      slug: 'widget-y',
      name: 'Widget Y',
      status: 'draft',
      source: 'feed_import',
    });

    expect(product.status).toBe('draft');
    expect(product.source).toBe('feed_import');
  });

  it('accepts an optional category, defaulting to null', async () => {
    const { repo } = makeFakeProducts();

    const withCategory = await new CreateProduct(repo).execute({
      slug: 'widget-z',
      name: 'Widget Z',
      category: 'Widgets',
    });
    expect(withCategory.category).toBe('Widgets');

    const withoutCategory = await new CreateProduct(repo).execute({ slug: 'widget-w', name: 'Widget W' });
    expect(withoutCategory.category).toBeNull();
  });

  it('throws on an invalid slug', async () => {
    const { repo, created } = makeFakeProducts();

    await expect(new CreateProduct(repo).execute({ slug: '!!! not a slug !!!', name: 'X' })).rejects.toThrow(
      'Invalid slug',
    );
    expect(created).toHaveLength(0);
  });
});
