import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { AddToCart } from './add-to-cart';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
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

function makeProduct(id: string, unitAmountMinor: number, name = `Widget ${id.slice(0, 4)}`) {
  return Product.create({
    id,
    slug: Slug.create(`widget-${id.slice(0, 4)}`),
    name,
    description: null,
    status: 'active',
    price: Money.of(unitAmountMinor, 'USD'),
  });
}

function makeFakeCarts(cart: Cart | null) {
  const saved: Cart[] = [];
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    // Mirrors the repository's read-transform-write, so a use-case test
    // cannot pass against a fake that skips the step entirely.
    async mutate(owner, transform) {
      const current = await this.get(owner);
      const base = current ?? Cart.create({ id: 'fake-cart', owner, lines: [] });
      const next = transform(base);
      await this.save(next);
      return next;
    },
    async save(c) {
      saved.push(c);
    },
    async delete() {
      return true;
    },
  };
  return { repo, saved };
}

function makeFakeProducts(productsById: Map<string, Product>) {
  const repo: Partial<ProductRepository> = {
    async findById(productId) {
      return productsById.get(productId) ?? null;
    },
  };
  return repo as ProductRepository;
}

describe('AddToCart', () => {
  it('creates a new cart when none exists yet', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1000);
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map([[productId, product]]));

    const result = await new AddToCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId,
      quantity: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines).toHaveLength(1);
      expect(result.value.lines[0]?.quantity).toBe(2);
    }
    expect(saved).toHaveLength(1);
  });

  it('merges quantity into an existing line for the same product', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1000);
    const existingCart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, productName: product.name, quantity: 1, unitPrice: product.price })],
    });
    const { repo: carts, saved } = makeFakeCarts(existingCart);
    const products = makeFakeProducts(new Map([[productId, product]]));

    const result = await new AddToCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId,
      quantity: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines).toHaveLength(1);
      expect(result.value.lines[0]?.quantity).toBe(3); // 1 + 2
    }
    expect(saved).toHaveLength(1);
  });

  it('returns product_not_found when the product is not in the catalog', async () => {
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());

    const result = await new AddToCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId: randomUUID(),
      quantity: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('product_not_found');
    expect(saved).toHaveLength(0);
  });

  it('records a cart_changed analytics event when a repository is provided', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1000);
    const { repo: carts } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: events, recorded } = makeFakeEvents();

    await new AddToCart(carts, products, events).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId,
      quantity: 2,
    });

    expect(recorded).toEqual([
      {
        eventType: 'cart_changed',
        sessionId: 's1',
        userId: null,
        metadata: { lines: [{ productId, quantity: 2 }] },
      },
    ]);
  });

  it('does not record an event when no repository is provided', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1000);
    const { repo: carts } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map([[productId, product]]));

    const result = await new AddToCart(carts, products).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId,
      quantity: 1,
    });

    expect(result.ok).toBe(true);
  });

  it('still adds the line when analytics recording fails', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1000);
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const failingEvents: Partial<AnalyticsEventRepository> = {
      record: async () => {
        throw new Error('db unavailable');
      },
    };
    const events = failingEvents as AnalyticsEventRepository;

    const result = await new AddToCart(carts, products, events).execute({
      owner: { type: 'guest', sessionId: 's1' },
      productId,
      quantity: 1,
    });

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
  });
});
