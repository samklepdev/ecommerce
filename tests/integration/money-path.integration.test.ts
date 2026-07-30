import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { Cart } from '@/modules/cart/domain/cart';
import { CartLine } from '@/modules/cart/domain/cart-line';
import { Money } from '@/shared/domain/money';
import { RedisCartRepository } from '@/modules/cart/infrastructure/redis-cart-repository';
import { DrizzleShippingRateRepository } from '@/modules/shipping/infrastructure/drizzle-shipping-rate-repository';
import { isErr } from '@/shared/domain/result';
import { makeProduct, makeSupplier, makeSupplierOffer } from './factories';
import { buildMoneyPath } from './money-path';
import { useTestInfrastructure } from './harness';

const SHIPPING_ADDRESS = {
  name: 'Test Customer',
  line1: '1 Test Street',
  city: 'Testville',
  region: 'CA',
  postalCode: '94000',
  country: 'US',
};

/**
 * Place order → derive address → watcher sees payment → order reaches paid →
 * supplier orders created.
 *
 * That sequence is the product, and until now nothing tested it. Every step
 * here is the real implementation against real Postgres and Redis; only the
 * chain and the price feed are stood in for, because the alternative needs
 * bitcoin and a market.
 */
describe('the money path (integration)', () => {
  const { db, redis } = useTestInfrastructure();

  const owner = { type: 'guest', sessionId: 'session-under-test' } as const;

  /** A product with somewhere to buy it from, in a cart, ready to check out. */
  async function arrangeCartWithOneProduct(unitAmountMinor = 25_00) {
    const product = await makeProduct(db, { unitAmountMinor, status: 'active' });
    const supplier = await makeSupplier(db);
    await makeSupplierOffer(db, {
      productId: product.id,
      supplierId: supplier.id,
      isPreferred: true,
    });

    await new RedisCartRepository(redis).save(
      Cart.create({
        id: randomUUID(),
        owner,
        lines: [
          CartLine.create({
            productId: product.id,
            sku: product.sku,
            quantity: 1,
            unitPrice: Money.of(unitAmountMinor, 'USD'),
          }),
        ],
      }),
    );

    return { product, supplier };
  }

  beforeEach(async () => {
    // Shipping is snapshotted onto the order, so it has to exist first.
    await new DrizzleShippingRateRepository(db).set(Money.of(20_00, 'USD'));
  });

  it('carries an order from cart to paid to sourced', async () => {
    const { product, supplier } = await arrangeCartWithOneProduct();
    const path = buildMoneyPath(db, redis, { requiredConfirmations: 3 });

    // 1. Place the order.
    const placed = await path.placeOrder.execute({
      owner,
      customerEmail: 'buyer@example.com',
      currency: 'USD',
      shippingAddress: SHIPPING_ADDRESS,
    });
    expect(isErr(placed)).toBe(false);
    if (isErr(placed)) return;
    const orderId = placed.value.id;
    expect(placed.value.paymentStatus).toBe('pending');

    // 2. Check out: reprices server-side and derives a unique address.
    const session = await path.startCheckout.execute({
      orderId,
      customerEmail: 'buyer@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: orderId,
    });
    expect(isErr(session)).toBe(false);
    if (isErr(session)) return;

    const { reference: address, expectedSats, bip21Uri } = session.value;
    expect(address).toMatch(/^(tb1|bc1)/);
    // The QR encodes the same address and amount the page shows.
    expect(bip21Uri).toContain(`bitcoin:${address}`);
    // $25 + $20 shipping at 1,000 sats/USD.
    expect(expectedSats).toBe(45_000);
    expect((await path.orders.findById(orderId))?.paymentStatus).toBe('awaiting_payment');

    // 3. The customer pays, but it's only one block deep.
    path.chain.pay(address, expectedSats, 1);
    await path.watcher.runOnce();

    expect((await path.orders.findById(orderId))?.paymentStatus).toBe('awaiting_confirmation');
    expect(path.notifier.notified).toEqual([]);

    // 4. It reaches the required depth.
    path.chain.pay(address, expectedSats, 3);
    await path.watcher.runOnce();

    const paid = await path.orders.findById(orderId);
    expect(paid?.paymentStatus).toBe('paid');
    expect(path.notifier.notified).toEqual([orderId]);

    // 5. And fulfilment has something to act on.
    const supplierOrders = await path.supplierOrders.listByOrderId(orderId);
    expect(supplierOrders).toHaveLength(1);
    expect(supplierOrders[0]!.supplierId).toBe(supplier.id);
    expect(supplierOrders[0]!.lines[0]!.sku).toBe(product.sku);
  });

  it('gives two orders two different addresses', async () => {
    const path = buildMoneyPath(db, redis);
    const addresses: string[] = [];

    for (const email of ['first@example.com', 'second@example.com']) {
      await arrangeCartWithOneProduct();
      const placed = await path.placeOrder.execute({
        owner,
        customerEmail: email,
        currency: 'USD',
        shippingAddress: SHIPPING_ADDRESS,
      });
      if (isErr(placed)) throw new Error('order not placed');

      const session = await path.startCheckout.execute({
        orderId: placed.value.id,
        customerEmail: email,
        paymentMethod: 'crypto',
        idempotencyKey: placed.value.id,
      });
      if (isErr(session)) throw new Error('checkout not started');
      addresses.push(session.value.reference);
    }

    // Address reuse destroys order↔payment correlation and leaks revenue
    // history on-chain. This is the invariant the whole derivation design
    // exists to protect.
    expect(new Set(addresses).size).toBe(2);
  });

  it('does not mark an underpaid order paid, however deep it is', async () => {
    await arrangeCartWithOneProduct();
    const path = buildMoneyPath(db, redis, { requiredConfirmations: 2 });

    const placed = await path.placeOrder.execute({
      owner,
      customerEmail: 'short@example.com',
      currency: 'USD',
      shippingAddress: SHIPPING_ADDRESS,
    });
    if (isErr(placed)) throw new Error('order not placed');
    const session = await path.startCheckout.execute({
      orderId: placed.value.id,
      customerEmail: 'short@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: placed.value.id,
    });
    if (isErr(session)) throw new Error('checkout not started');

    // Well short, and buried 20 blocks deep.
    path.chain.pay(session.value.reference, session.value.expectedSats - 5_000, 20);
    await path.watcher.runOnce();

    const order = await path.orders.findById(placed.value.id);
    expect(order?.paymentStatus).toBe('awaiting_confirmation');
    expect(await path.supplierOrders.listByOrderId(placed.value.id)).toHaveLength(0);
  });

  it('is idempotent across repeated watcher passes', async () => {
    const { supplier } = await arrangeCartWithOneProduct();
    const path = buildMoneyPath(db, redis, { requiredConfirmations: 1 });

    const placed = await path.placeOrder.execute({
      owner,
      customerEmail: 'repeat@example.com',
      currency: 'USD',
      shippingAddress: SHIPPING_ADDRESS,
    });
    if (isErr(placed)) throw new Error('order not placed');
    const session = await path.startCheckout.execute({
      orderId: placed.value.id,
      customerEmail: 'repeat@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: placed.value.id,
    });
    if (isErr(session)) throw new Error('checkout not started');

    path.chain.pay(session.value.reference, session.value.expectedSats, 6);

    // The watcher re-runs every ~45s forever. A second pass over a settled
    // order must not confirm it twice, notify twice, or order stock twice.
    await path.watcher.runOnce();
    await path.watcher.runOnce();
    await path.watcher.runOnce();

    expect(path.notifier.notified).toEqual([placed.value.id]);
    const supplierOrders = await path.supplierOrders.listByOrderId(placed.value.id);
    expect(supplierOrders).toHaveLength(1);
    expect(supplierOrders[0]!.supplierId).toBe(supplier.id);
  });

  it('stops watching an order once it is paid', async () => {
    await arrangeCartWithOneProduct();
    const path = buildMoneyPath(db, redis, { requiredConfirmations: 1 });

    const placed = await path.placeOrder.execute({
      owner,
      customerEmail: 'done@example.com',
      currency: 'USD',
      shippingAddress: SHIPPING_ADDRESS,
    });
    if (isErr(placed)) throw new Error('order not placed');
    const session = await path.startCheckout.execute({
      orderId: placed.value.id,
      customerEmail: 'done@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: placed.value.id,
    });
    if (isErr(session)) throw new Error('checkout not started');

    path.chain.pay(session.value.reference, session.value.expectedSats, 6);
    await path.watcher.runOnce();

    const queriedBefore = path.chain.queried.length;
    await path.watcher.runOnce();

    // Settled intents drop out of listWatchable, so the Esplora provider
    // isn't polled for them forever.
    expect(path.chain.queried.length).toBe(queriedBefore);
  });
});
