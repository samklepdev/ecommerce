import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { ReorderItems } from './reorder-items';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { ProductVariant } from '@/modules/catalog/domain/product-variant';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type {
  OrderDetail,
  OrderHistoryRepository,
} from '@/modules/orders/application/ports/order-history-repository';

function makeVariant(id: string, unitAmountMinor: number, sku = `SKU-${id.slice(0, 4)}`) {
  return ProductVariant.create({
    id,
    productId: randomUUID(),
    sku,
    name: 'Default',
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
    async delete() {},
  };
  return { repo, saved };
}

function makeFakeProducts(variantsById: Map<string, ProductVariant>) {
  const repo: Partial<ProductRepository> = {
    async findVariantById(variantId: string) {
      return variantsById.get(variantId) ?? null;
    },
  };
  return repo as ProductRepository;
}

const owner = { type: 'guest' as const, sessionId: 's1' };

describe('ReorderItems', () => {
  it('adds every reorderable line to a fresh cart, re-priced from the catalog', async () => {
    const variantId = randomUUID();
    const order = makeOrderDetail({
      lines: [{ variantId, sku: 'OLD-SKU', quantity: 2, unitAmountMinor: 1, imageUrl: null }], // stale price on purpose
    });
    const { repo: orders } = makeFakeOrderHistory(order);
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map([[variantId, makeVariant(variantId, 1999)]]));

    const result = await new ReorderItems(orders, carts, products).execute({
      owner,
      orderId: 'order-1',
      ownerUserId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.addedCount).toBe(1);
      expect(result.value.unavailableSkus).toEqual([]);
    }
    expect(saved).toHaveLength(1);
    expect(saved[0]?.lines[0]?.unitPrice.amountMinor).toBe(1999); // catalog price, not the stale 1
    expect(saved[0]?.lines[0]?.quantity).toBe(2);
  });

  it('merges into an existing cart rather than replacing it', async () => {
    const variantId = randomUUID();
    const existingVariantId = randomUUID();
    const order = makeOrderDetail({
      lines: [{ variantId, sku: 'SKU-A', quantity: 1, unitAmountMinor: 500, imageUrl: null }],
    });
    const { repo: orders } = makeFakeOrderHistory(order);
    const existingCart = Cart.create({
      id: randomUUID(),
      owner,
      lines: [
        CartLine.create({
          variantId: existingVariantId,
          sku: 'SKU-EXISTING',
          quantity: 1,
          unitPrice: Money.of(300, 'USD'),
        }),
      ],
    });
    const { repo: carts, saved } = makeFakeCarts(existingCart);
    const products = makeFakeProducts(new Map([[variantId, makeVariant(variantId, 500, 'SKU-A')]]));

    await new ReorderItems(orders, carts, products).execute({ owner, orderId: 'order-1', ownerUserId: null });

    expect(saved[0]?.lines).toHaveLength(2);
  });

  it('skips lines whose variant no longer exists, reporting them rather than failing', async () => {
    const goneVariantId = randomUUID();
    const order = makeOrderDetail({
      lines: [{ variantId: goneVariantId, sku: 'GONE-SKU', quantity: 1, unitAmountMinor: 100, imageUrl: null }],
    });
    const { repo: orders } = makeFakeOrderHistory(order);
    const { repo: carts, saved } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map()); // variant not found

    const result = await new ReorderItems(orders, carts, products).execute({
      owner,
      orderId: 'order-1',
      ownerUserId: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.addedCount).toBe(0);
      expect(result.value.unavailableSkus).toEqual(['GONE-SKU']);
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
