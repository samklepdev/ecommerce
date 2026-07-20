import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { ProductVariant } from './product-variant';
import { Money } from '@/shared/domain/money';

function makeProps(overrides: Partial<Parameters<typeof ProductVariant.create>[0]> = {}) {
  return {
    id: randomUUID(),
    productId: randomUUID(),
    sku: 'WIDGET-X',
    name: 'Default',
    price: Money.of(1999, 'USD'),
    ...overrides,
  };
}

describe('ProductVariant.create', () => {
  it('creates a variant with a non-empty sku', () => {
    const variant = ProductVariant.create(makeProps());
    expect(variant.sku).toBe('WIDGET-X');
    expect(variant.price.amountMinor).toBe(1999);
  });

  it('throws for an empty sku', () => {
    expect(() => ProductVariant.create(makeProps({ sku: '' }))).toThrow(/non-empty sku/);
  });

  it('throws for a whitespace-only sku', () => {
    expect(() => ProductVariant.create(makeProps({ sku: '   ' }))).toThrow(/non-empty sku/);
  });
});
