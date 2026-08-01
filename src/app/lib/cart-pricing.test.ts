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

  describe('a product priced in another currency', () => {
    /**
     * A product's currency is admin-entered free text, so a cart can end up
     * holding a line the store's currency can't add to.
     *
     * This used to throw `Currency mismatch` out of a server component,
     * 500-ing `/cart` and `/checkout` for that visitor on every visit — and
     * the page that would let them remove the offending item was the page that
     * crashed, so the only escape was clearing the session cookie.
     *
     * Treated as unavailable instead: the same state a deleted product
     * produces, which the pages already know how to render and `PlaceOrder`
     * already refuses.
     */
    function foreignCatalogue(id: string, minor: number): Map<string, LiveProduct> {
      return new Map([[id, { id, name: `Live ${id}`, price: Money.of(minor, 'EUR') }]]);
    }

    it('does not throw', () => {
      expect(() =>
        repriceCartForDisplay([line('a', 1000)], foreignCatalogue('a', 900), 'USD'),
      ).not.toThrow();
    });

    it('flags the line unavailable', () => {
      const result = repriceCartForDisplay([line('a', 1000)], foreignCatalogue('a', 900), 'USD');

      expect(result.lines[0]?.unavailable).toBe(true);
      expect(result.hasUnavailable).toBe(true);
    });

    it('keeps the snapshot price so the row still renders', () => {
      const result = repriceCartForDisplay([line('a', 1000)], foreignCatalogue('a', 900), 'USD');

      expect(result.lines[0]?.unitPrice.amountMinor).toBe(1000);
      expect(result.lines[0]?.unitPrice.currency).toBe('USD');
      // Not a price *change* — the customer can't act on a figure in another
      // currency, and showing it as a "was" would be nonsense.
      expect(result.lines[0]?.previousUnitPrice).toBeNull();
    });

    it('still totals the rest of the cart', () => {
      const products = new Map<string, LiveProduct>([
        ['a', { id: 'a', name: 'Live a', price: Money.of(900, 'EUR') }],
        ['b', { id: 'b', name: 'Live b', price: Money.of(2500, 'USD') }],
      ]);

      const result = repriceCartForDisplay([line('a', 1000), line('b', 2000)], products, 'USD');

      // 1000 snapshot + 2500 live.
      expect(result.subtotal.amountMinor).toBe(3500);
    });
  });

  describe('a product whose supplier offer has been withdrawn', () => {
    /**
     * `PlaceOrder` refuses a line whose supplier offer is missing or
     * unavailable — it is the rule, not a display detail. But no storefront
     * surface checked it for cart lines, so the item rendered normally right
     * up until the customer had filled in the whole address form and pressed
     * pay, and the resulting error named no item. With several items in the
     * cart the only way forward was removing them one at a time and
     * resubmitting, which also burns the checkout rate limit.
     *
     * The product itself is fine — it exists, it is priced correctly — so the
     * catalogue lookup can't express this. The page passes it in.
     */
    it('flags the line unavailable', () => {
      const result = repriceCartForDisplay(
        [line('a', 1000)],
        catalogue(['a', 1000]),
        'USD',
        new Set(['a']),
      );

      expect(result.lines[0]?.unavailable).toBe(true);
      expect(result.hasUnavailable).toBe(true);
    });

    it('still prices it, so the row reads normally apart from the warning', () => {
      const result = repriceCartForDisplay(
        [line('a', 1000)],
        catalogue(['a', 1200]),
        'USD',
        new Set(['a']),
      );

      // The live price, as everywhere else — the item is unbuyable, not unpriced.
      expect(result.lines[0]?.unitPrice.amountMinor).toBe(1200);
      expect(result.subtotal.amountMinor).toBe(1200);
    });

    it('leaves other lines alone', () => {
      const result = repriceCartForDisplay(
        [line('a', 1000), line('b', 2000)],
        catalogue(['a', 1000], ['b', 2000]),
        'USD',
        new Set(['a']),
      );

      expect(result.lines[0]?.unavailable).toBe(true);
      expect(result.lines[1]?.unavailable).toBe(false);
    });

    it('defaults to everything being sellable when the page does not say', () => {
      // The parameter is optional so existing callers keep their behaviour.
      const result = repriceCartForDisplay([line('a', 1000)], catalogue(['a', 1000]), 'USD');

      expect(result.hasUnavailable).toBe(false);
    });
  });
});
