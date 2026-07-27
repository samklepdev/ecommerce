import { describe, expect, it } from 'vitest';

import { CreateProduct, type CreateProductInput } from './create-product';
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

/** Sku and price are required now that the product is the sellable unit, so
 * every case supplies them — only the field under test varies. */
function makeInput(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    slug: 'widget-x',
    name: 'Widget X',
    sku: 'WIDGET-X',
    unitAmountMinor: 1999,
    currency: 'USD',
    ...overrides,
  };
}

describe('CreateProduct', () => {
  it('creates a product with defaulted status and source', async () => {
    const { repo, created } = makeFakeProducts();

    const product = await new CreateProduct(repo).execute(makeInput());

    expect(product.status).toBe('active');
    expect(product.source).toBe('manual');
    expect(product.slug.value).toBe('widget-x');
    expect(created).toEqual([product]);
  });

  it('carries the sku and price onto the product', async () => {
    const { repo } = makeFakeProducts();

    const product = await new CreateProduct(repo).execute(
      makeInput({ sku: 'WIDGET-PRO', unitAmountMinor: 4550, currency: 'EUR' }),
    );

    expect(product.sku).toBe('WIDGET-PRO');
    expect(product.price.amountMinor).toBe(4550);
    expect(product.price.currency).toBe('EUR');
  });

  it('honors explicit status and source when given', async () => {
    const { repo } = makeFakeProducts();

    const product = await new CreateProduct(repo).execute(
      makeInput({ slug: 'widget-y', name: 'Widget Y', status: 'draft', source: 'feed_import' }),
    );

    expect(product.status).toBe('draft');
    expect(product.source).toBe('feed_import');
  });

  it('accepts an optional category, defaulting to null', async () => {
    const { repo } = makeFakeProducts();

    const withCategory = await new CreateProduct(repo).execute(
      makeInput({ slug: 'widget-z', name: 'Widget Z', category: 'Widgets' }),
    );
    expect(withCategory.category).toBe('Widgets');

    const withoutCategory = await new CreateProduct(repo).execute(
      makeInput({ slug: 'widget-w', name: 'Widget W' }),
    );
    expect(withoutCategory.category).toBeNull();
  });

  it('throws on an invalid slug', async () => {
    const { repo, created } = makeFakeProducts();

    await expect(
      new CreateProduct(repo).execute(makeInput({ slug: '!!! not a slug !!!' })),
    ).rejects.toThrow('Invalid slug');
    expect(created).toHaveLength(0);
  });

  it('rejects a price that is not an integer minor-unit value', async () => {
    const { repo, created } = makeFakeProducts();

    await expect(
      new CreateProduct(repo).execute(makeInput({ unitAmountMinor: 19.99 })),
    ).rejects.toThrow(/integer minor-unit/);
    expect(created).toHaveLength(0);
  });
});
