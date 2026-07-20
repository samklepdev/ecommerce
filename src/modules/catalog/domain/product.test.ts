import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { Product } from './product';
import { ProductVariant } from './product-variant';
import { Slug } from './slug';
import { Money } from '@/shared/domain/money';

function makeVariant() {
  return ProductVariant.create({
    id: randomUUID(),
    productId: randomUUID(),
    sku: 'WIDGET-X',
    name: 'Default',
    price: Money.of(1999, 'USD'),
  });
}

function makeProps(overrides: Partial<Parameters<typeof Product.create>[0]> = {}) {
  return {
    id: randomUUID(),
    slug: Slug.create('widget-x'),
    name: 'Widget X',
    description: null,
    status: 'draft' as const,
    variants: [makeVariant()],
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

describe('Product#findVariant', () => {
  it('finds a variant by id', () => {
    const variant = makeVariant();
    const product = Product.create(makeProps({ variants: [variant] }));
    expect(product.findVariant(variant.id)).toBe(variant);
  });

  it('returns undefined for an unknown variant id', () => {
    const product = Product.create(makeProps());
    expect(product.findVariant('nonexistent')).toBeUndefined();
  });
});
