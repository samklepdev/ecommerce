import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import type { AssertStoreOpenForCheckout } from '@/shared/application/use-cases/assert-store-open-for-checkout';
import { PlaceOrder } from './place-order';
import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Product } from '@/modules/catalog/domain/product';
import { Slug } from '@/modules/catalog/domain/slug';
import { Money } from '@/shared/domain/money';
import { isErr, isOk } from '@/shared/domain/result';
import type { CartRepository } from '@/modules/cart/application/ports/cart-repository';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { OrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { Order } from '@/modules/orders/domain/order';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';
import { Coupon } from '@/modules/coupons/domain/coupon';
import type { CouponRepository } from '@/modules/coupons/application/ports/coupon-repository';

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

/** Same shape as `makeProduct`, with the currency under the test's control —
 * a product's currency is admin-entered free text, so a mismatch is one typo
 * away. */
function makeProductInCurrency(id: string, unitAmountMinor: number, currency: string) {
  return Product.create({
    id,
    slug: Slug.create(`widget-${id.slice(0, 4)}`),
    name: `Widget ${id.slice(0, 4)}`,
    description: null,
    status: 'active',
    price: Money.of(unitAmountMinor, currency),
  });
}

function makeFakeCarts(cart: Cart | null) {
  const deletedOwners: unknown[] = [];
  let present = cart !== null;
  const repo: CartRepository = {
    async get() {
      return cart;
    },
    async save() {},
    // Mirrors Redis DEL: reports whether this call is the one that removed it,
    // so exactly one of two concurrent callers can win.
    async delete(owner) {
      deletedOwners.push(owner);
      if (!present) return false;
      present = false;
      return true;
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
  const deadlines: Date[] = [];
  const repo: OrderRepository = {
    async create(order, paymentDeadlineAt) {
      created.push(order);
      deadlines.push(paymentDeadlineAt);
    },
  };
  return { repo, created, deadlines };
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

/**
 * Supplier offers, keyed by product id to `isAvailable`. A product absent from
 * the map has no offer at all. Defaults to "available" so the tests that predate
 * this check keep describing what they were written to describe.
 */
/** Everything obtainable — for the tests that predate this check and are about
 * something else entirely. */
function makeFakeOffersAllAvailable(): SupplierOfferRepository {
  const repo: Partial<SupplierOfferRepository> = {
    async findSourceableByProductId() {
      return { supplierId: 'sup-1', isAvailable: true, cost: Money.of(500, 'USD') } as never;
    },
  };
  return repo as SupplierOfferRepository;
}

function makeFakeOffers(availability: Record<string, boolean> = {}): SupplierOfferRepository {
  const repo: Partial<SupplierOfferRepository> = {
    async findSourceableByProductId(productId) {
      const isAvailable = availability[productId];
      if (isAvailable === undefined) return null;
      return { supplierId: 'sup-1', isAvailable, cost: Money.of(500, 'USD') } as never;
    },
  };
  return repo as SupplierOfferRepository;
}

/** The kill switch, open — every test here predates it and none is about
 * it. The closed case has its own test at the bottom. */
function storeOpen(isOpen = true): AssertStoreOpenForCheckout {
  return { execute: async () => isOpen } as AssertStoreOpenForCheckout;
}

describe('PlaceOrder', () => {
  /**
   * The same authority-vs-display split that let checkout show a stale price.
   * The storefront disables Add to Cart when the supplier offer says
   * unavailable — but `PlaceOrder` only refused a *missing* product, so an item
   * already in a cart when the supplier marked it unavailable checked out
   * happily, as did a direct POST to the action.
   *
   * The customer then pays irreversibly for something that cannot be sourced,
   * and the order lands in the unfulfillable queue with their money already
   * spent.
   */
  it('refuses a line whose supplier offer is unavailable', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1999);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, productName: 'Widget', quantity: 1, unitPrice: Money.of(1999, 'USD') })],
    });
    const { repo: carts, deletedOwners } = makeFakeCarts(cart);
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(
      carts,
      makeFakeProducts(new Map([[productId, product]])),
      orders,
      makeFakeShippingRates(Money.zero('USD')),
      makeFakeCoupons(),
      storeOpen(),
      makeFakeOffers({ [productId]: false }),
    ).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('product_unavailable');
    expect(created).toEqual([]);
    // And the cart is kept — they can remove the item and try again.
    expect(deletedOwners).toEqual([]);
  });

  it('refuses a line with no supplier offer at all', async () => {
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, productName: 'Widget', quantity: 1, unitPrice: Money.of(1999, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(
      carts,
      makeFakeProducts(new Map([[productId, makeProduct(productId, 1999)]])),
      orders,
      makeFakeShippingRates(Money.zero('USD')),
      makeFakeCoupons(),
      storeOpen(),
      makeFakeOffers({}),
    ).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    expect(created).toEqual([]);
  });

  /**
   * A double-submitted checkout used to mint two orders from one cart — and
   * `StartCheckout` then derives a BTC address per order, so the customer gets
   * two invoices, two addresses are burned against the wallet's BIP32 gap
   * limit, and whichever one they pay leaves the other outstanding.
   *
   * The cart is the mutex. Redis `DEL` reports whether it removed anything, so
   * of two concurrent callers exactly one gets `true` and proceeds.
   */
  it('creates one order when the same cart is submitted twice', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1999);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, productName: 'Widget', quantity: 1, unitPrice: Money.of(1999, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const placeOrder = new PlaceOrder(
      carts,
      products,
      orders,
      makeFakeShippingRates(Money.zero('USD')),
      makeFakeCoupons(),
      storeOpen(),
      makeFakeOffersAllAvailable(),
    );
    const input = {
      owner: { type: 'guest', sessionId: 's1' } as const,
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    };

    const [first, second] = await Promise.all([placeOrder.execute(input), placeOrder.execute(input)]);

    expect(created).toHaveLength(1);
    const outcomes = [first, second];
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
    const failed = outcomes.find((r) => !r.ok);
    expect(failed && !failed.ok && failed.error.code).toBe('cart_already_submitted');
  });

  it('claims the cart before writing the order', async () => {
    // Ordering is the whole guarantee: claim, then create. Reversed, both
    // callers reach `orders.create` and the race is back.
    const productId = randomUUID();
    const product = makeProduct(productId, 1999);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [CartLine.create({ productId, productName: 'Widget', quantity: 1, unitPrice: Money.of(1999, 'USD') })],
    });
    const { repo: carts, deletedOwners } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const order: string[] = [];
    const orders: OrderRepository = {
      async create() {
        order.push('create');
      },
    };
    const trackingCarts: CartRepository = {
      ...carts,
      async delete(owner) {
        order.push('claim');
        return carts.delete(owner);
      },
    };

    await new PlaceOrder(
      trackingCarts,
      products,
      orders,
      makeFakeShippingRates(Money.zero('USD')),
      makeFakeCoupons(),
      storeOpen(),
      makeFakeOffersAllAvailable(),
    ).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(order).toEqual(['claim', 'create']);
    expect(deletedOwners).toHaveLength(1);
  });

  it('turns a priced cart into a durable pending order, repricing from the catalog', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1999); // catalog price
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      // Cart's own stored price is stale/wrong on purpose — PlaceOrder must
      // never trust it.
      lines: [CartLine.create({ productId, productName: 'Stale Name', quantity: 2, unitPrice: Money.of(1, 'USD') })],
    });

    const { repo: carts, deletedOwners } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();

    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
    expect(order.lines[0]?.productName).toBe(product.name); // catalog name, not the cart's stale one
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
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
      lines: [CartLine.create({ productId, productName: 'Gone Widget', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map()); // product not found
    const { repo: orders, created } = makeFakeOrders();

    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();
    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
      lines: [CartLine.create({ productId, productName: 'Widget X', quantity: 1, unitPrice: Money.of(500, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons();

    await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
      lines: [CartLine.create({ productId, productName: 'Widget X', quantity: 1, unitPrice: Money.of(1000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.of(599, 'USD'));
    const coupons = makeFakeCoupons();

    await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
      lines: [CartLine.create({ productId, productName: 'Widget X', quantity: 1, unitPrice: Money.of(2000, 'USD') })],
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

    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
      lines: [CartLine.create({ productId, productName: 'Widget X', quantity: 1, unitPrice: Money.of(2000, 'USD') })],
    });
    const { repo: carts } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();
    const shippingRates = makeFakeShippingRates(Money.zero('USD'));
    const coupons = makeFakeCoupons(null);

    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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
      lines: [CartLine.create({ productId, productName: 'Widget X', quantity: 1, unitPrice: Money.of(2000, 'USD') })],
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

    const result = await new PlaceOrder(carts, products, orders, shippingRates, coupons, storeOpen(), makeFakeOffersAllAvailable()).execute({
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

  // Checked before the cart is even read, and before anything is written:
  // a closed store must not mint orders, however the action was reached.
  it('refuses to create an order when the store kill switch is on', async () => {
    const productId = randomUUID();
    const product = makeProduct(productId, 1999);
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [
        CartLine.create({ productId, productName: 'Widget One', quantity: 1, unitPrice: Money.of(1999, 'USD') }),
      ],
    });

    const { repo: carts, deletedOwners } = makeFakeCarts(cart);
    const products = makeFakeProducts(new Map([[productId, product]]));
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(
      carts,
      products,
      orders,
      makeFakeShippingRates(Money.zero('USD')),
      makeFakeCoupons(),
      storeOpen(false),
      makeFakeOffersAllAvailable(),
    ).execute({
      owner: { type: 'guest', sessionId: 's1' },
      customerEmail: 'test@example.com',
      currency: 'USD',
      shippingAddress: validShippingAddress(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('store_closed');
    expect(created).toHaveLength(0);
    // And the customer's cart survives, so reopening doesn't cost them it.
    expect(deletedOwners).toEqual([]);
  });
});

describe('PlaceOrder and the payment deadline', () => {
  /**
   * The deadline used to be stamped by `StartCheckout`, which runs as a
   * *separate* call after this one. When it failed — the rate feed down, Redis
   * unavailable, a bad xpub — the order was written with a NULL deadline, and
   * every query that finds work to do filters on that column with `<` or `>`,
   * which NULL never satisfies. The order was therefore invisible to
   * `ExpireStaleCheckouts` and to `listWatchable` at the same time: it could
   * never expire, and nobody would ever look at its address. It sat `pending`
   * in the admin list forever and the only exit was an admin marking it failed
   * by hand.
   *
   * Stamping it here starts the clock when the order is placed, which is also
   * the honest reading — that is when the customer committed.
   */
  function arrangeOneItemCart() {
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [
        CartLine.create({
          productId,
          productName: 'Widget',
          quantity: 1,
          unitPrice: Money.of(1999, 'USD'),
        }),
      ],
    });
    return {
      carts: makeFakeCarts(cart).repo,
      products: makeFakeProducts(new Map([[productId, makeProduct(productId, 1999)]])),
      shippingRates: makeFakeShippingRates(Money.zero('USD')),
      coupons: makeFakeCoupons(),
      offers: makeFakeOffersAllAvailable(),
    };
  }

  const input = {
    owner: { type: 'guest', sessionId: 's1' } as const,
    customerEmail: 'test@example.com',
    currency: 'USD',
    shippingAddress: validShippingAddress(),
  };

  it('stamps a payment deadline when the order is written', async () => {
    const a = arrangeOneItemCart();
    const { repo, deadlines } = makeFakeOrders();
    const before = Date.now();

    const result = await new PlaceOrder(
      a.carts,
      a.products,
      repo,
      a.shippingRates,
      a.coupons,
      storeOpen(),
      a.offers,
      24,
    ).execute(input);

    expect(result.ok).toBe(true);
    expect(deadlines).toHaveLength(1);
    const deadline = deadlines[0]!.getTime();
    expect(deadline).toBeGreaterThanOrEqual(before + 24 * 3_600_000 - 5_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 24 * 3_600_000 + 5_000);
  });

  it('honours a configured window other than the default', async () => {
    const a = arrangeOneItemCart();
    const { repo, deadlines } = makeFakeOrders();
    const before = Date.now();

    await new PlaceOrder(
      a.carts,
      a.products,
      repo,
      a.shippingRates,
      a.coupons,
      storeOpen(),
      a.offers,
      1,
    ).execute(input);

    expect(deadlines[0]!.getTime()).toBeGreaterThanOrEqual(before + 3_600_000 - 5_000);
    expect(deadlines[0]!.getTime()).toBeLessThanOrEqual(Date.now() + 3_600_000 + 5_000);
  });
});

describe('PlaceOrder and a product priced in another currency', () => {
  /**
   * A product's currency is admin-entered free text, so a mismatched one is
   * one typo away — and `EditOrderLines` already guards against exactly this
   * (`product.price.currency !== order.currency`). The customer-facing path
   * did not.
   *
   * Without the guard nothing notices until `Order.create`'s total reduces
   * from `Money.zero(currency)` and throws `Currency mismatch` — which happens
   * *after* `carts.delete` has claimed the cart. The customer loses their
   * entire cart to a 500 page, no order is written, and there is no order id
   * to recover from. The claim-before-write ordering is right; the fix is to
   * refuse before reaching it.
   */
  function arrangeMismatchedCart() {
    const productId = randomUUID();
    const cart = Cart.create({
      id: randomUUID(),
      owner: { type: 'guest', sessionId: 's1' },
      lines: [
        CartLine.create({
          productId,
          productName: 'Widget',
          quantity: 1,
          unitPrice: Money.of(1999, 'USD'),
        }),
      ],
    });
    return {
      productId,
      carts: makeFakeCarts(cart),
      // Same id, priced in EUR — an admin edited the product after it was added.
      products: makeFakeProducts(new Map([[productId, makeProduct(productId, 1999)]])),
      eurProducts: makeFakeProducts(
        new Map([[productId, makeProductInCurrency(productId, 1999, 'EUR')]]),
      ),
      shippingRates: makeFakeShippingRates(Money.zero('USD')),
      coupons: makeFakeCoupons(),
      offers: makeFakeOffersAllAvailable(),
    };
  }

  const input = {
    owner: { type: 'guest', sessionId: 's1' } as const,
    customerEmail: 'test@example.com',
    currency: 'USD',
    shippingAddress: validShippingAddress(),
  };

  it('refuses the order rather than throwing', async () => {
    const a = arrangeMismatchedCart();
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(
      a.carts.repo,
      a.eurProducts,
      orders,
      a.shippingRates,
      a.coupons,
      storeOpen(),
      a.offers,
    ).execute(input);

    expect(isErr(result)).toBe(true);
    if (isErr(result) && result.error.code === 'product_unavailable') {
      expect(result.error.productId).toBe(a.productId);
    } else {
      expect.unreachable('expected product_unavailable');
    }
    expect(created).toEqual([]);
  });

  it('leaves the cart intact, so the customer still has something to fix', async () => {
    // The whole point of catching it here rather than at `Order.create`.
    const a = arrangeMismatchedCart();
    const { repo: orders } = makeFakeOrders();

    await new PlaceOrder(
      a.carts.repo,
      a.eurProducts,
      orders,
      a.shippingRates,
      a.coupons,
      storeOpen(),
      a.offers,
    ).execute(input);

    expect(a.carts.deletedOwners).toEqual([]);
  });

  it('still places a matching-currency order', async () => {
    const a = arrangeMismatchedCart();
    const { repo: orders, created } = makeFakeOrders();

    const result = await new PlaceOrder(
      a.carts.repo,
      a.products,
      orders,
      a.shippingRates,
      a.coupons,
      storeOpen(),
      a.offers,
    ).execute(input);

    expect(isOk(result)).toBe(true);
    expect(created).toHaveLength(1);
  });
});
