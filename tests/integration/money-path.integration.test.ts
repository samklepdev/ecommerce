import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  const built: { closeJobs: () => Promise<void> }[] = [];

  /** Tracked so every worker this file starts is closed again — an open
   * BullMQ worker keeps the process alive after the suite finishes. */
  function money(...args: Parameters<typeof buildMoneyPath>) {
    const path = buildMoneyPath(...args);
    built.push(path);
    return path;
  }

  afterEach(async () => {
    await Promise.all(built.map((p) => p.closeJobs()));
    built.length = 0;
  });

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
            productName: product.name,
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
    const path = money(db, redis, { requiredConfirmations: 3 });

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

    // The sourcing work and the email are jobs now, not inline calls.
    await path.drainJobs();
    expect(path.notifier.notified).toEqual([orderId]);

    // 5. And fulfilment has something to act on.
    const supplierOrders = await path.supplierOrders.listByOrderId(orderId);
    expect(supplierOrders).toHaveLength(1);
    expect(supplierOrders[0]!.supplierId).toBe(supplier.id);
    expect(supplierOrders[0]!.lines[0]!.productName).toBe(product.name);
  });

  it('gives two orders two different addresses', async () => {
    const path = money(db, redis);
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
    const path = money(db, redis, { requiredConfirmations: 2 });

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
    await path.drainJobs();

    const order = await path.orders.findById(placed.value.id);
    expect(order?.paymentStatus).toBe('awaiting_confirmation');
    expect(await path.supplierOrders.listByOrderId(placed.value.id)).toHaveLength(0);
  });

  /**
   * The top-up path, end to end. This is the whole reason underpayment stopped
   * being a dead end, and none of the pieces are obvious from unit tests: the
   * chain reports the *cumulative* total at an address, so the second payment
   * has to be what lifts the order over the line, and the order has to still be
   * in `listWatchable` for anyone to notice.
   */
  it('completes an underpaid order when the customer tops it up', async () => {
    const { supplier } = await arrangeCartWithOneProduct();
    const path = money(db, redis, { requiredConfirmations: 2 });

    const placed = await path.placeOrder.execute({
      owner,
      customerEmail: 'topup@example.com',
      currency: 'USD',
      shippingAddress: SHIPPING_ADDRESS,
    });
    if (isErr(placed)) throw new Error('order not placed');
    const session = await path.startCheckout.execute({
      orderId: placed.value.id,
      customerEmail: 'topup@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: placed.value.id,
    });
    if (isErr(session)) throw new Error('checkout not started');

    // Pays most of it, deep enough that only the amount is wrong.
    const shortfall = 5_000;
    path.chain.pay(session.value.reference, session.value.expectedSats - shortfall, 5);
    await path.watcher.runOnce();
    await path.drainJobs();

    expect((await path.orders.findById(placed.value.id))?.paymentStatus).toBe(
      'awaiting_confirmation',
    );
    // And the customer was told once, with the balance.
    expect(path.underpaidNotices).toEqual([placed.value.id]);

    // The top-up. The chain reports the total held at the address, not the
    // individual payment, which is exactly why the same address can be reused.
    path.chain.pay(session.value.reference, session.value.expectedSats, 5);
    await path.watcher.runOnce();
    await path.drainJobs();

    const order = await path.orders.findById(placed.value.id);
    expect(order?.paymentStatus).toBe('paid');

    // And it goes on to source normally — a topped-up order is not a special
    // case downstream, it's just a paid one.
    const supplierOrders = await path.supplierOrders.listByOrderId(placed.value.id);
    expect(supplierOrders).toHaveLength(1);
    expect(supplierOrders[0]?.supplierId).toBe(supplier.id);

    // Still told exactly once: the second pass must not mail them again now
    // that nothing is owed.
    expect(path.underpaidNotices).toEqual([placed.value.id]);
  });

  it('is idempotent across repeated watcher passes', async () => {
    const { supplier } = await arrangeCartWithOneProduct();
    const path = money(db, redis, { requiredConfirmations: 1 });

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
    await path.drainJobs();

    expect(path.notifier.notified).toEqual([placed.value.id]);
    const supplierOrders = await path.supplierOrders.listByOrderId(placed.value.id);
    expect(supplierOrders).toHaveLength(1);
    expect(supplierOrders[0]!.supplierId).toBe(supplier.id);
  });

  it('stops watching an order once it is paid', async () => {
    await arrangeCartWithOneProduct();
    const path = money(db, redis, { requiredConfirmations: 1 });

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

  /**
   * A payment that has been broadcast but not yet mined.
   *
   * Nothing confirmed means nothing counted, so this state used to be
   * indistinguishable from "hasn't paid at all": the order kept ticking toward
   * its deadline and could be expired out from under a transaction that was
   * simply waiting for a block. Wanting to be sure the whole chain of
   * consequences holds — the column round-trips, the status moves, the sweep
   * leaves it alone, the re-quote is refused — is exactly what a fake
   * repository can't tell you.
   */
  it('holds an order open for a payment sitting in the mempool', async () => {
    await arrangeCartWithOneProduct();
    const path = money(db, redis, { requiredConfirmations: 2 });

    const placed = await path.placeOrder.execute({
      owner,
      customerEmail: 'mempool@example.com',
      currency: 'USD',
      shippingAddress: SHIPPING_ADDRESS,
    });
    if (isErr(placed)) throw new Error('order not placed');
    const session = await path.startCheckout.execute({
      orderId: placed.value.id,
      customerEmail: 'mempool@example.com',
      paymentMethod: 'crypto',
      idempotencyKey: placed.value.id,
    });
    if (isErr(session)) throw new Error('checkout not started');

    // Paid in full — and not yet in a block.
    path.chain.broadcast(session.value.reference, session.value.expectedSats);
    await path.watcher.runOnce();
    await path.drainJobs();

    const afterBroadcast = await path.orders.findById(placed.value.id);
    expect(afterBroadcast?.paymentStatus).toBe('awaiting_confirmation');
    // Not paid: mempool value must never settle an order.
    expect(afterBroadcast?.paymentStatus).not.toBe('paid');
    // And the customer was not asked for money already on its way.
    expect(path.underpaidNotices).toEqual([]);

    // Round-trips through Postgres, which is the half a fake can't prove.
    const intent = await path.paymentStore.getByOrderId(placed.value.id);
    expect(intent?.pendingSats).toBe(session.value.expectedSats);
    expect(intent?.confirmedSats).toBe(0);

    // The sweep that closes stale checkouts must not take this one.
    await path.expireStaleCheckouts.execute();
    expect((await path.orders.findById(placed.value.id))?.paymentStatus).toBe(
      'awaiting_confirmation',
    );

    // Nor may a re-quote restate what they already sent.
    const requote = await path.refreshPaymentQuote.execute({ orderId: placed.value.id });
    expect(isErr(requote)).toBe(true);

    // Still watched, so the confirmation will be noticed.
    path.chain.pay(session.value.reference, session.value.expectedSats, 2);
    await path.watcher.runOnce();
    await path.drainJobs();

    expect((await path.orders.findById(placed.value.id))?.paymentStatus).toBe('paid');
  });

});