import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { Product } from './product';
import { Slug } from './slug';
import { Money } from '@/shared/domain/money';

function makeProps(overrides: Partial<Parameters<typeof Product.create>[0]> = {}) {
  return {
    id: randomUUID(),
    slug: Slug.create('widget-x'),
    name: 'Widget X',
    description: null,
    status: 'draft' as const,
    sku: 'WIDGET-X',
    price: Money.of(1999, 'USD'),
    ...overrides,
  };
}

describe('Product.create', () => {
  it('creates a product with defaults', () => {
    const product = Product.create(makeProps());
    expect(product.imageUrl).toBeNull();
    expect(product.additionalImages).toEqual([]);
    expect(product.source).toBe('manual');
  });

  it('throws for an empty name', () => {
    expect(() => Product.create(makeProps({ name: '' }))).toThrow(/non-empty name/);
  });

  it('throws for a whitespace-only name', () => {
    expect(() => Product.create(makeProps({ name: '   ' }))).toThrow(/non-empty name/);
  });

  // The sku moved here when variants were removed, and it carries the same
  // invariant it had on the variant: a product with no stock-keeping identity
  // can't be ordered from a supplier.
  it('throws for an empty sku', () => {
    expect(() => Product.create(makeProps({ sku: '  ' }))).toThrow(/non-empty sku/);
  });
});

describe('Product#isActive', () => {
  it('is true only when status is active', () => {
    expect(Product.create(makeProps({ status: 'active' })).isActive).toBe(true);
    expect(Product.create(makeProps({ status: 'draft' })).isActive).toBe(false);
    expect(Product.create(makeProps({ status: 'archived' })).isActive).toBe(false);
  });
});

describe('Product#hoverImageUrl', () => {
  it('is null when there are no additional images', () => {
    expect(Product.create(makeProps()).hoverImageUrl).toBeNull();
  });

  it('is the first additional image url, ordered', () => {
    const product = Product.create(
      makeProps({
        additionalImages: [
          { id: 'a', url: '/a.png', position: 1 },
          { id: 'b', url: '/b.png', position: 2 },
        ],
      }),
    );
    expect(product.hoverImageUrl).toBe('/a.png');
  });
});
