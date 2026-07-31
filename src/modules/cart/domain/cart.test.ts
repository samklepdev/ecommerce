import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { Cart } from './cart';
import { CartLine, MAX_CART_LINE_QUANTITY } from './cart-line';
import { Money } from '@/shared/domain/money';

function makeLine(productId: string, quantity: number, unitAmountMinor = 1000) {
  return CartLine.create({
    productId,
    productName: `Widget ${productId.slice(0, 4)}`,
    quantity,
    unitPrice: Money.of(unitAmountMinor, 'USD'),
  });
}

function makeCart(lines: CartLine[] = []) {
  return Cart.create({ id: randomUUID(), owner: { type: 'guest', sessionId: 's1' }, lines });
}

describe('Cart#isEmpty', () => {
  it('is true with no lines', () => {
    expect(makeCart().isEmpty).toBe(true);
  });

  it('is false with at least one line', () => {
    expect(makeCart([makeLine(randomUUID(), 1)]).isEmpty).toBe(false);
  });
});

describe('Cart#addLine', () => {
  it('adds a new line for a product not already in the cart', () => {
    const cart = makeCart();
    const line = makeLine(randomUUID(), 2);
    const updated = cart.addLine(line);
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]?.quantity).toBe(2);
  });

  it('sums quantities when adding a line for a product already in the cart', () => {
    const productId = randomUUID();
    const cart = makeCart([makeLine(productId, 2)]);
    const updated = cart.addLine(makeLine(productId, 3));
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]?.quantity).toBe(5);
  });

  it('does not mutate the original cart', () => {
    const cart = makeCart();
    cart.addLine(makeLine(randomUUID(), 1));
    expect(cart.isEmpty).toBe(true);
  });

  it('clamps a brand-new line to the max quantity', () => {
    const cart = makeCart();
    const updated = cart.addLine(makeLine(randomUUID(), MAX_CART_LINE_QUANTITY + 50));
    expect(updated.lines[0]?.quantity).toBe(MAX_CART_LINE_QUANTITY);
  });

  it('clamps the summed quantity to the max even when each add was individually within bounds', () => {
    const productId = randomUUID();
    const cart = makeCart([makeLine(productId, MAX_CART_LINE_QUANTITY - 10)]);
    const updated = cart.addLine(makeLine(productId, 20));
    expect(updated.lines[0]?.quantity).toBe(MAX_CART_LINE_QUANTITY);
  });
});

describe('Cart#removeLine', () => {
  it('removes the line for the given product', () => {
    const productId = randomUUID();
    const cart = makeCart([makeLine(productId, 1)]);
    expect(cart.removeLine(productId).isEmpty).toBe(true);
  });

  it('is a no-op for a product not in the cart', () => {
    const cart = makeCart([makeLine(randomUUID(), 1)]);
    expect(cart.removeLine(randomUUID()).lines).toHaveLength(1);
  });
});

describe('Cart#setLineQuantity', () => {
  it('sets the quantity for the given product', () => {
    const productId = randomUUID();
    const cart = makeCart([makeLine(productId, 2)]);
    const updated = cart.setLineQuantity(productId, 5);
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]?.quantity).toBe(5);
  });

  it('is a no-op for a product not in the cart', () => {
    const cart = makeCart([makeLine(randomUUID(), 2)]);
    const updated = cart.setLineQuantity(randomUUID(), 5);
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]?.quantity).toBe(2);
  });

  it('removes the line when set to zero or a negative quantity', () => {
    const productId = randomUUID();
    const cart = makeCart([makeLine(productId, 2)]);
    expect(cart.setLineQuantity(productId, 0).isEmpty).toBe(true);
    expect(cart.setLineQuantity(productId, -1).isEmpty).toBe(true);
  });

  it('does not mutate the original cart', () => {
    const productId = randomUUID();
    const cart = makeCart([makeLine(productId, 2)]);
    cart.setLineQuantity(productId, 9);
    expect(cart.lines[0]?.quantity).toBe(2);
  });

  it('clamps to the max quantity', () => {
    const productId = randomUUID();
    const cart = makeCart([makeLine(productId, 2)]);
    const updated = cart.setLineQuantity(productId, MAX_CART_LINE_QUANTITY + 50);
    expect(updated.lines[0]?.quantity).toBe(MAX_CART_LINE_QUANTITY);
  });
});

describe('Cart#mergeWith', () => {
  it('unions lines from another cart', () => {
    const cart = makeCart([makeLine('v1', 1)]);
    const other = makeCart([makeLine('v2', 1)]);
    const merged = cart.mergeWith(other);
    expect(merged.lines.map((l) => l.productId).sort()).toEqual(['v1', 'v2']);
  });

  it('sums quantities on a colliding product', () => {
    const cart = makeCart([makeLine('v1', 2)]);
    const other = makeCart([makeLine('v1', 3)]);
    const merged = cart.mergeWith(other);
    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0]?.quantity).toBe(5);
  });
});

describe('Cart#subtotal', () => {
  it('sums the subtotal of every line', () => {
    const cart = makeCart([makeLine('v1', 2, 1000), makeLine('v2', 1, 500)]);
    // (1000*2) + (500*1) = 2500
    expect(cart.subtotal('USD').amountMinor).toBe(2500);
  });

  it('is zero for an empty cart', () => {
    expect(makeCart().subtotal('USD').amountMinor).toBe(0);
  });
});
