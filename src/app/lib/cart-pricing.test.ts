import { describe, expect, it } from 'vitest';

import { repriceCartForDisplay, type LiveProduct, type PricedCartLine } from './cart-pricing';
import { Money } from '@/shared/domain/money';

function line(productId: string, unitMinor: number, quantity = 1): PricedCartLine {
  return {
    productId,
    productName: `Snapshot ${productId}`,
    quantity,
    unitPrice: Money.of(unitMinor, 'USD'),
  };
}

function catalogue(...entries: [string, number, string?][]): Map<string, LiveProduct> {
  return new Map(
    entries.map(([id, minor, name]) => [
      id,
      { id, name: name ?? `Live ${id}`, price: Money.of(minor, 'USD') },
    ]),
  );
}

describe('repriceCartForDisplay', () => {
  /**
   * The defect this exists for: the page showed the add-to-cart price while
   * `PlaceOrder` charged the live one, so a customer could authorise $50 and
   * have satoshis quoted for $500.
   */
  it('shows the live price, not the price captured at add-to-cart', () => {
    const result = repriceCartForDisplay([line('p1', 5000)], catalogue(['p1', 50000]), 'USD');

    expect(result.lines[0]?.unitPrice.amountMinor).toBe(50000);
    expect(result.subtotal.amountMinor).toBe(50000);
  });

  it('flags the change and keeps the old price so it can be shown', () => {
    const result = repriceCartForDisplay([line('p1', 5000)], catalogue(['p1', 50000]), 'USD');

    expect(result.hasPriceChanges).toBe(true);
    expect(result.lines[0]?.previousUnitPrice?.amountMinor).toBe(5000);
  });

  it('reports no change when the price is the same', () => {
    const result = repriceCartForDisplay([line('p1', 5000)], catalogue(['p1', 5000]), 'USD');

    expect(result.hasPriceChanges).toBe(false);
    expect(result.lines[0]?.previousUnitPrice).toBeNull();
  });

  it('multiplies by quantity', () => {
    const result = repriceCartForDisplay([line('p1', 1999, 3)], catalogue(['p1', 1999]), 'USD');

    expect(result.lines[0]?.lineTotal.amountMinor).toBe(5997);
    expect(result.subtotal.amountMinor).toBe(5997);
  });

  it('sums a mixed cart', () => {
    const result = repriceCartForDisplay(
      [line('p1', 1000, 2), line('p2', 2500)],
      catalogue(['p1', 1200], ['p2', 2500]),
      'USD',
    );

    expect(result.subtotal.amountMinor).toBe(4900); // 1200*2 + 2500
    expect(result.hasPriceChanges).toBe(true);
  });

  it('flags a product that has left the catalogue and keeps its snapshot', () => {
    // Blanking the row would be worse than showing a stale price; `PlaceOrder`
    // refuses the order with `product_unavailable` regardless.
    const result = repriceCartForDisplay([line('gone', 5000)], catalogue(), 'USD');

    expect(result.hasUnavailable).toBe(true);
    expect(result.lines[0]?.unavailable).toBe(true);
    expect(result.lines[0]?.unitPrice.amountMinor).toBe(5000);
    expect(result.lines[0]?.name).toBe('Snapshot gone');
  });

  it('does not report a missing product as a price change', () => {
    // Distinct problems needing distinct messages: one says "the price moved",
    // the other says "you cannot buy this".
    const result = repriceCartForDisplay([line('gone', 5000)], catalogue(), 'USD');

    expect(result.hasPriceChanges).toBe(false);
  });

  it('prefers the live product name over the snapshot', () => {
    const result = repriceCartForDisplay([line('p1', 5000)], catalogue(['p1', 5000, 'Renamed']), 'USD');

    expect(result.lines[0]?.name).toBe('Renamed');
  });

  it('returns a zero subtotal for an empty cart', () => {
    const result = repriceCartForDisplay([], catalogue(), 'USD');

    expect(result.subtotal.amountMinor).toBe(0);
    expect(result.hasPriceChanges).toBe(false);
    expect(result.hasUnavailable).toBe(false);
  });

  it('handles a price that went down as well as up', () => {
    const result = repriceCartForDisplay([line('p1', 5000)], catalogue(['p1', 2500]), 'USD');

    expect(result.subtotal.amountMinor).toBe(2500);
    expect(result.hasPriceChanges).toBe(true);
    expect(result.lines[0]?.previousUnitPrice?.amountMinor).toBe(5000);
  });
});
