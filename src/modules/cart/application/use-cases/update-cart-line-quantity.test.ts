import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { UpdateCartLineQuantity } from './update-cart-line-quantity';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';

function makeFakeCarts(cart: Cart | null) {
  const saved: Cart[] = [];
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    async save(c) {
      saved.push(c);
    },
    async delete() {},
  };
  return { repo, saved };
}

describe('UpdateCartLineQuantity', () => {
  it('sets the line to the given quantity and saves the cart', async () => {
    const variantId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ variantId, sku: 'A', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo, saved } = makeFakeCarts(cart);

    const updated = await new UpdateCartLineQuantity(repo).execute({
      owner: { type: 'guest', sessionId: 's1' },
      variantId,
      quantity: 4,
    });

    expect(updated.lines[0]?.quantity).toBe(4);
    expect(saved).toHaveLength(1);
  });

  it('removes the line when set to zero', async () => {
    const variantId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ variantId, sku: 'A', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo } = makeFakeCarts(cart);

    const updated = await new UpdateCartLineQuantity(repo).execute({
      owner: { type: 'guest', sessionId: 's1' },
      variantId,
      quantity: 0,
    });

    expect(updated.isEmpty).toBe(true);
  });

  it('is a no-op that returns an empty cart when there is no cart at all', async () => {
    const { repo, saved } = makeFakeCarts(null);

    const updated = await new UpdateCartLineQuantity(repo).execute({
      owner: { type: 'guest', sessionId: 's1' },
      variantId: 'missing',
      quantity: 3,
    });

    expect(updated.isEmpty).toBe(true);
    expect(saved).toHaveLength(1);
  });
});
