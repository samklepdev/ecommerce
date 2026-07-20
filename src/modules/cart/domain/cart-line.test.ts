import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { CartLine } from './cart-line';
import { Money } from '@/shared/domain/money';

function makeProps(overrides: Partial<Parameters<typeof CartLine.create>[0]> = {}) {
  return {
    variantId: randomUUID(),
    sku: 'WIDGET-X',
    quantity: 2,
    unitPrice: Money.of(1000, 'USD'),
    ...overrides,
  };
}

describe('CartLine.create', () => {
  it('creates a line with a positive quantity', () => {
    const line = CartLine.create(makeProps({ quantity: 3 }));
    expect(line.quantity).toBe(3);
  });

  it('throws for a zero quantity', () => {
    expect(() => CartLine.create(makeProps({ quantity: 0 }))).toThrow(/quantity must be positive/);
  });

  it('throws for a negative quantity', () => {
    expect(() => CartLine.create(makeProps({ quantity: -1 }))).toThrow(/quantity must be positive/);
  });
});

describe('CartLine#subtotal', () => {
  it('multiplies unit price by quantity', () => {
    const line = CartLine.create(makeProps({ quantity: 3, unitPrice: Money.of(500, 'USD') }));
    expect(line.subtotal.amountMinor).toBe(1500);
  });
});

describe('CartLine#withQuantity', () => {
  it('returns a new line with the updated quantity, same other fields', () => {
    const line = CartLine.create(makeProps({ quantity: 2 }));
    const updated = line.withQuantity(5);
    expect(updated.quantity).toBe(5);
    expect(updated.variantId).toBe(line.variantId);
    expect(updated).not.toBe(line);
  });

  it('throws if the new quantity is not positive', () => {
    const line = CartLine.create(makeProps());
    expect(() => line.withQuantity(0)).toThrow(/quantity must be positive/);
  });
});
