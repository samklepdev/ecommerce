import { describe, expect, it } from 'vitest';
import { OrderLine } from './order-line';
import { Money } from '@/shared/domain/money';

describe('OrderLine.create', () => {
  it('throws when quantity is zero', () => {
    expect(() =>
      OrderLine.create({ id: '1', variantId: 'v1', sku: 'SKU', quantity: 0, unitPrice: Money.of(1000, 'USD') }),
    ).toThrow('quantity must be positive');
  });

  it('throws when quantity is negative', () => {
    expect(() =>
      OrderLine.create({ id: '1', variantId: 'v1', sku: 'SKU', quantity: -1, unitPrice: Money.of(1000, 'USD') }),
    ).toThrow('quantity must be positive');
  });

  it('accepts a positive quantity', () => {
    const line = OrderLine.create({ id: '1', variantId: 'v1', sku: 'SKU', quantity: 1, unitPrice: Money.of(1000, 'USD') });
    expect(line.quantity).toBe(1);
  });
});

describe('OrderLine#subtotal', () => {
  it('multiplies unit price by quantity', () => {
    const line = OrderLine.create({ id: '1', variantId: 'v1', sku: 'SKU', quantity: 3, unitPrice: Money.of(1999, 'USD') });
    expect(line.subtotal.amountMinor).toBe(5997);
    expect(line.subtotal.currency).toBe('USD');
  });
});
