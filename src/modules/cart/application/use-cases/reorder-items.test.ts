import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { ReorderItems } from './reorder-items';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type {
  OrderDetail,
  OrderHistoryRepository,
} from '@/modules/orders/application/ports/order-history-repository';

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

function makeOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    createdAt: new Date(),
    currency: 'USD',
    amountMinor: 1999,
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    customerEmail: 'buyer@example.com',
    paymentRecoveredFrom: null,
    notes: null,
    discountAmountMinor: 0,
    couponCode: null,
    shippingAddress: null,
    shippingAmountMinor: 0,
    lines: [],
    ...overrides,
  };
}

function makeFakeOrderHistory(order: OrderDetail | null) {
  const scopedCalls: { orderId: string; userId: string }[] = [];
  const unscopedCalls: string[] = [];
  const repo: Partial<OrderHistoryRepository> = {
    async findDetailById(orderId, userId) {
      scopedCalls.push({ orderId, userId });
      return order;
    },
    async findById(orderId) {
      unscopedCalls.push(orderId);
      return order;
    },
  };
  return { repo: repo as OrderHistoryRepository, scopedCalls, unscopedCalls };
}

function makeFakeCarts(existing: Cart | null) {
  const saved: Cart[] = [];
  const repo: CartRepository = {
    async get() {
      return existing;
    },
    async save(cart) {
      saved.push(cart);
    },
    async delete() {
      return true;
    },
  };
  return { repo, saved };
}

function makeFakeProducts(productsById: Map<string, Product>) {
  const repo: Partial<ProductRepository> = {
    async findById(productId: string) {
      return productsById.get(productId) ?? null;
    },
  };
  return repo as ProductRepository;
}

const owner = { type: 'guest' as const, sessionId: 's1' };

describe('ReorderItems', () => {
  it('adds every reorderable line to a fresh cart, re-priced from the catalog', async () => {
    const productId = randomUUID();
    const order = makeOrderDetail({
      lines: [{ id: 'order-line-1', productId, productName: 'Stale Name', quantity: 2, unitAmountMinor: 1, imageUrl: null }], // stale price on purpose
    });
    const { repo: orders } = makeFakeOrderHistory(order);
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map([[productId, makeProduct(productId, 1999)]]));

    const result = await new ReorderItems(orders, carts, products).execute({
      owner,
      orderId: 'order-1',
      ownerUserId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.addedCount).toBe(1);
      expect(result.value.unavailableNames).toEqual([]);
    }
    expect(saved).toHaveLength(1);
    expect(saved[0]?.lines[0]?.unitPrice.amountMinor).toBe(1999); // catalog price, not the stale 1
    expect(saved[0]?.lines[0]?.quantity).toBe(2);
  });

  it('merges into an existing cart rather than replacing it', async () => {
    const productId = randomUUID();
    const existingProductId = randomUUID();
    const order = makeOrderDetail({
      lines: [{ id: 'order-line-1', productId, productName: 'Widget A', quantity: 1, unitAmountMinor: 500, imageUrl: null }],
    });
    const { repo: orders } = makeFakeOrderHistory(order);
    const existingCart = Cart.create({
      id: randomUUID(),
      owner,
      lines: [
        CartLine.create({
          productId: existingProductId,
          productName: 'Existing Widget',
          quantity: 1,
          unitPrice: Money.of(300, 'USD'),
        }),
      ],
    });
    const { repo: carts, saved } = makeFakeCarts(existingCart);
    const products = makeFakeProducts(new Map([[productId, makeProduct(productId, 500, 'Widget A')]]));

    await new ReorderItems(orders, carts, products).execute({ owner, orderId: 'order-1', ownerUserId: null });

    expect(saved[0]?.lines).toHaveLength(2);
  });

  it('skips lines whose product no longer exists, reporting them rather than failing', async () => {
    const goneProductId = randomUUID();
    const order = makeOrderDetail({
      lines: [{ id: 'order-line-1', productId: goneProductId, productName: 'Gone Widget', quantity: 1, unitAmountMinor: 100, imageUrl: null }],
    });
    const { repo: orders } = makeFakeOrderHistory(order);
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map()); // product not found

    const result = await new ReorderItems(orders, carts, products).execute({
      owner,
      orderId: 'order-1',
      ownerUserId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.addedCount).toBe(0);
      expect(result.value.unavailableNames).toEqual(['Gone Widget']);
    }
    expect(saved).toHaveLength(1);
    expect(saved[0]?.lines).toHaveLength(0);
  });

  it('returns order_not_found when the order does not exist', async () => {
    const { repo: orders } = makeFakeOrderHistory(null);
    const { repo: carts } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());

    const result = await new ReorderItems(orders, carts, products).execute({
      owner,
      orderId: 'missing',
      ownerUserId: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('order_not_found');
  });

  it('uses the scoped findDetailById when ownerUserId is set, unscoped findById when null', async () => {
    const order = makeOrderDetail();
    const { repo: orders, scopedCalls, unscopedCalls } = makeFakeOrderHistory(order);
    const { repo: carts } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());

    await new ReorderItems(orders, carts, products).execute({ owner, orderId: 'order-1', ownerUserId: 'user-1' });
    expect(scopedCalls).toEqual([{ orderId: 'order-1', userId: 'user-1' }]);
    expect(unscopedCalls).toEqual([]);

    await new ReorderItems(orders, carts, products).execute({ owner, orderId: 'order-1', ownerUserId: null });
    expect(unscopedCalls).toEqual(['order-1']);
  });
});
