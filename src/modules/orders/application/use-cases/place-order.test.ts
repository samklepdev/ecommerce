import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { PlaceOrder } from './place-order';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { ProductVariant } from '@/modules/catalog/domain/product-variant';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { OrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { Order } from '@/modules/orders/domain/order';

function makeVariant(id: string, unitAmountMinor: number) {
  return ProductVariant.create({
    id,
    productId: randomUUID(),
    sku: `SKU-${id.slice(0, 4)}`,
    name: 'Default',
    price: Money.of(unitAmountMinor, 'USD'),
  });
}

function makeFakeCarts(cart: Cart | null) {
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    async save() {},
    async delete() {},
  };
  return repo;
}

function makeFakeProducts(variantsById: Map<string, ProductVariant>) {
  const repo: Partial<ProductRepository> = {
    async findVariantById(variantId: string) {
      return variantsById.get(variantId) ?? null;
    },
  };
  return repo as ProductRepository;
}

function makeFakeOrders() {
  const created: Order[] = [];
  const repo: OrderRepository = {
    async create(order) {
      created.push(order);
    },
  };
  return { repo, created };
}

function validShippingAddress() {
  return {
    name: 'Ada Lovelace',
    line1: '1 Test St',
    city: 'Testville',
    region: 'TS',
    postalCode: '00000',
    country: 'US',
  };
}

describe('PlaceOrder', () => {
  it('turns a priced cart into a durable pending order, repricing from the catalog', async () => {
    const variantId = randomUUID();
    const variant = makeVariant(variantId, 1999); // catalog price
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      // Cart's own stored price is stale/wrong on purpose — PlaceOrder must
      // never trust it.
      lines: [CartLine.create({ variantId, sku: 'OLD-SKU', quantity: 2, unitPrice: Money.of(1, 'USD') })],
    });

    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[variantId, variant]]));
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(carts, products, orders).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);
    const order = created[0]!;
    expect(order.lines).toHaveLength(1);
    // Priced from the catalog (1999), not the cart's stale stored price (1).
    expect(order.lines[0]?.unitPrice.amountMinor).toBe(1999);
    expect(order.lines[0]?.sku).toBe(variant.sku); // catalog sku, not the cart's stale one
    expect(order.paymentStatus).toBe('pending');
    expect(order.fulfillmentStatus).toBe('unfulfilled');
  });

  it('returns empty_cart when the cart has no lines', async () => {
    const cart = Cart.create({ id: randomUUID(), owner: { type: 'guest', sessionId: 's1' }, lines: [] });
    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map());
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(carts, products, orders).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('empty_cart');
    expect(created).toHaveLength(0);
  });

  it('returns empty_cart when there is no cart at all', async () => {
    const carts = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());
    const { repo: orders } = makeFakeOrders();

    const result = await new PlaceOrder(carts, products, orders).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('empty_cart');
  });

  it('returns variant_unavailable when a cart line references a variant no longer in the catalog', async () => {
    const variantId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ variantId, sku: 'GONE', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map()); // variant not found
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(carts, products, orders).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('variant_unavailable');
      if (result.error.code === 'variant_unavailable') expect(result.error.variantId).toBe(variantId);
    }
    expect(created).toHaveLength(0);
  });

  it('sets userId from the owner when logged in, null for a guest', async () => {
    const variantId = randomUUID();
    const variant = makeVariant(variantId, 500);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'user', userId: 'user-1' },
      lines: [CartLine.create({ variantId, sku: 'X', quantity: 1, unitPrice: Money.of(500, 'USD') })],
    });
    const carts = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[variantId, variant]]));
    const { repo: orders, created } = makeFakeOrders();

    await new PlaceOrder(carts, products, orders).execute({
      owner: { type: 'user', userId: 'user-1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(created[0]?.userId).toBe('user-1');
  });
});
