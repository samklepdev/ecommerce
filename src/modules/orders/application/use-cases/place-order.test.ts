import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { PlaceOrder } from './place-order';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { OrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { Order } from '@/modules/orders/domain/order';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';
import { Coupon } from '@/modules/coupons/domain/coupon';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

function makeProduct(id: string, unitAmountMinor: number, sku = `SKU-${id.slice(0, 4)}`) {
  return Product.create({
    id,
    slug: Slug.create(`widget-${id.slice(0, 4)}`),
    name: 'Widget',
    description: null,
    status: 'active',
    sku,
    price: Money.of(unitAmountMinor, 'USD'),
  });
}

function makeFakeCarts(cart: Cart | null) {
  const deletedOwners: unknown[] = [];
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    async save() {},
    async delete(owner) {
      deletedOwners.push(owner);
    },
  };
  return { repo, deletedOwners };
}

function makeFakeProducts(productsById: Map<string, Product>) {
  const repo: Partial<ProductRepository> = {
    async findById(productId: string) {
      return productsById.get(productId) ?? null;
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

function makeFakeShippingRates(rate: Money) {
  const repo: ShippingRateRepository = {
    async get() {
      return rate;
    },
    async set() {},
  };
  return repo;
}

function makeFakeCoupons(coupon: Coupon | null = null) {
  const repo: Partial<CouponRepository> = {
    async findByCode() {
      return coupon;
    },
  };
  return repo as CouponRepository;
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
    const productId = randomUUID();
    const product = makeProduct(productId, 1999); // catalog price
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      // Cart's own stored price is stale/wrong on purpose — PlaceOrder must
      // never trust it.
      lines: [CartLine.create({ productId, sku: 'OLD-SKU', quantity: 2, unitPrice: Money.of(1, 'USD') })],
    });

    const { repo: carts, deletedOwners } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();

    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
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
    expect(order.lines[0]?.sku).toBe(product.sku); // catalog sku, not the cart's stale one
    expect(order.paymentStatus).toBe('pending');
    expect(order.fulfillmentStatus).toBe('unfulfilled');
    // The cart is cleared once its contents become a durable order.
    expect(deletedOwners).toEqual([{ type: 'guest', sessionId: 's1' }]);
  });

  it('returns empty_cart when the cart has no lines', async () => {
    const cart = Cart.create({ id: randomUUID(), owner: { type: 'guest', sessionId: 's1' }, lines: [] });
    const { repo: carts, deletedOwners } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map());
    const { repo: orders, created } = makeFakeOrders();

    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('empty_cart');
    expect(created).toHaveLength(0);
    expect(deletedOwners).toHaveLength(0); // never clear on failure
  });

  it('returns empty_cart when there is no cart at all', async () => {
    const { repo: carts } = makeFakeCarts(null);
    const products = makeFakeProducts(new Map());
    const { repo: orders } = makeFakeOrders();

    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('empty_cart');
  });

  it('returns product_unavailable when a cart line references a product no longer in the catalog', async () => {
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, sku: 'GONE', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map()); // product not found
    const { repo: orders, created } = makeFakeOrders();

    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('product_unavailable');
      if (result.error.code === 'product_unavailable') expect(result.error.productId).toBe(productId);
    }
    expect(created).toHaveLength(0);
  });

  it('sets userId from the owner when logged in, null for a guest', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 500);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'user', userId: 'user-1' },
      lines: [CartLine.create({ productId, sku: 'X', quantity: 1, unitPrice: Money.of(500, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();

    await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'user', userId: 'user-1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(created[0]?.userId).toBe('user-1');
  });

  it('snapshots the current shipping rate onto the order', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1000);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, sku: 'X', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.of(599, 'USD'));
    const coupons = makeFakeCoupons();

    await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(created[0]?.shippingAmount.amountMinor).toBe(599);
    expect(created[0]?.total.amountMinor).toBe(1599);
  });

  it('applies a valid active coupon and snapshots the discount + code onto the order', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 2000);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, sku: 'X', quantity: 1, unitPrice: Money.of(2000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.of(500, 'USD'));
    const coupon = Coupon.create({
      id: 'c1',
      code: 'SAVE10',
      discountType: 'percentage',
      percentageValue: 10,
    });
    const coupons = makeFakeCoupons(coupon);

    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
      couponCode: 'save10',
    });

    expect(result.ok).toBe(true);
    expect(created[0]?.couponCode).toBe('SAVE10');
    expect(created[0]?.discountAmount.amountMinor).toBe(200); // 10% of 2000
    expect(created[0]?.total.amountMinor).toBe(2300); // 2000 - 200 + 500
  });

  it('returns invalid_coupon for a code that does not exist', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 2000);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, sku: 'X', quantity: 1, unitPrice: Money.of(2000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons(null);

    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
      couponCode: 'BOGUS',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_coupon');
    expect(created).toHaveLength(0);
  });

  it('returns invalid_coupon for a deactivated code', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 2000);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, sku: 'X', quantity: 1, unitPrice: Money.of(2000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const inactiveCoupon = Coupon.create({
      id: 'c1',
      code: 'OLDCODE',
      discountType: 'percentage',
      percentageValue: 10,
      isActive: false,
    });
    const coupons = makeFakeCoupons(inactiveCoupon);

    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
      couponCode: 'OLDCODE',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_coupon');
    expect(created).toHaveLength(0);
  });
});
