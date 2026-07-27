import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { UpdateCartLineQuantity } from './update-cart-line-quantity';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
} from '@/modules/analytics/application/ports/analytics-event-repository';

function makeFakeEvents() {
  const recorded: AnalyticsEventInput[] = [];
  const repo: Partial<AnalyticsEventRepository> = {
    async record(event) {
      recorded.push(event);
    },
  };
  return { repo: repo as AnalyticsEventRepository, recorded };
}

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
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, sku: 'A', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo, saved } = makeFakeCarts(cart);

    const updated = await new UpdateCartLineQuantity(repo).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId,
      quantity: 4,
    });

    expect(updated.lines[0]?.quantity).toBe(4);
    expect(saved).toHaveLength(1);
  });

  it('removes the line when set to zero', async () => {
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, sku: 'A', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo } = makeFakeCarts(cart);

    const updated = await new UpdateCartLineQuantity(repo).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId,
      quantity: 0,
    });

    expect(updated.isEmpty).toBe(true);
  });

  it('is a no-op that returns an empty cart when there is no cart at all', async () => {
    const { repo, saved } = makeFakeCarts(null);

    const updated = await new UpdateCartLineQuantity(repo).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId: 'missing',
      quantity: 3,
    });

    expect(updated.isEmpty).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('records a cart_changed analytics event when a repository is provided', async () => {
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'user', userId: 'u1' },
      lines: [CartLine.create({ productId, sku: 'A', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo } = makeFakeCarts(cart);
    const { repo: events, recorded } = makeFakeEvents();

    await new UpdateCartLineQuantity(repo, events).execute({
      owner: { type: 'user', userId: 'u1' },
      productId,
      quantity: 4,
    });

    expect(recorded).toEqual([
      {
        eventType: 'cart_changed',
        sessionId: 'u1',
        userId: 'u1',
        metadata: { lines: [{ productId, quantity: 4 }] },
      },
    ]);
  });

  it('still updates the quantity when analytics recording fails', async () => {
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'user', userId: 'u1' },
      lines: [CartLine.create({ productId, sku: 'A', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo, saved } = makeFakeCarts(cart);
    const failingEvents: Partial<AnalyticsEventRepository> = {
      record: async () => {
        throw new Error('db unavailable');
      },
    };
    const events = failingEvents as AnalyticsEventRepository;

    const updated = await new UpdateCartLineQuantity(repo, events).execute({
      owner: { type: 'user', userId: 'u1' },
      productId,
      quantity: 4,
    });

    expect(updated.lines[0]?.quantity).toBe(4);
    expect(saved).toHaveLength(1);
  });
});
