import { describe, expect, it } from 'vitest';

import { DrizzleBitcoinPaymentStore } from './drizzle-bitcoin-payment-store';
import { bitcoinPaymentIntents, orders } from '@/shared/infrastructure/db/schema';
import type { DB } from '@/shared/infrastructure/db/client';
import { useTestInfrastructure } from '../../../../../tests/integration/harness';

/**
 * The late-payment sweep's query lives entirely in SQL — which statuses count
 * as closed, how the age bound behaves, and whether the flag is genuinely
 * write-once. A fake store would be a second implementation of those rules and
 * couldn't disagree with itself, which is the whole reason this suite exists.
 *
 * What's at stake: this query is the only thing that ever looks at an address
 * again after its order closed. A row it wrongly excludes is real bitcoin
 * nobody will ever account for.
 */
describe('DrizzleBitcoinPaymentStore late payments (integration)', () => {
  const { db } = useTestInfrastructure();
  const store = () => new DrizzleBitcoinPaymentStore(db as DB);

  let seq = 0;
  async function seedIntent(
    database: DB,
    opts: { status: string; createdAt?: Date; latePaymentSeenAt?: Date },
  ) {
    seq += 1;
    const orderId = `order-${seq}`;
    await database.insert(orders).values({
      id: orderId,
      currency: 'USD',
      amountMinor: 1999,
      shippingAmountMinor: 0,
      discountAmountMinor: 0,
      customerEmail: 'buyer@example.com',
    });
    await database.insert(bitcoinPaymentIntents).values({
      orderId,
      address: `bc1qaddr${seq}`,
      addressIndex: seq,
      expectedSats: 100_000,
      fiatCurrency: 'USD',
      satsPerFiatUnit: 1_000,
      expiresAt: new Date('2026-07-01T00:00:00Z'),
      status: opts.status,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.latePaymentSeenAt ? { latePaymentSeenAt: opts.latePaymentSeenAt } : {}),
    });
    return orderId;
  }

  const longAgo = new Date('2020-01-01T00:00:00Z');

  it('returns expired and cancelled intents, and nothing else', async () => {
    await seedIntent(db as DB, { status: 'expired' });
    await seedIntent(db as DB, { status: 'cancelled' });
    // `awaiting` is still being polled by the watcher, and `confirmed` was paid
    // through the normal path — neither has anything to explain.
    await seedIntent(db as DB, { status: 'awaiting' });
    await seedIntent(db as DB, { status: 'confirmed' });

    const found = await store().listSweepable(longAgo);

    expect(found.map((i) => i.status).sort()).toEqual(['cancelled', 'expired']);
  });

  it('excludes an intent that was already flagged', async () => {
    await seedIntent(db as DB, { status: 'expired', latePaymentSeenAt: new Date() });

    expect(await store().listSweepable(longAgo)).toEqual([]);
  });

  it('honours the age bound, so the sweep never becomes a full wallet rescan', async () => {
    await seedIntent(db as DB, { status: 'expired', createdAt: new Date('2026-07-30T00:00:00Z') });
    await seedIntent(db as DB, { status: 'expired', createdAt: new Date('2020-06-01T00:00:00Z') });

    const found = await store().listSweepable(new Date('2026-07-01T00:00:00Z'));

    expect(found).toHaveLength(1);
    expect(found[0]?.address).toBe('bc1qaddr' + (seq - 1));
  });

  it('records a late payment and counts it', async () => {
    const orderId = await seedIntent(db as DB, { status: 'expired' });

    await store().recordLatePayment(orderId, 95_000);

    expect(await store().countLatePayments()).toBe(1);
    // And it drops out of the sweep, so the next pass doesn't re-report it.
    expect(await store().listSweepable(longAgo)).toEqual([]);
  });

  it('is write-once — a second sweep must not restate the discovery', async () => {
    const orderId = await seedIntent(db as DB, { status: 'expired' });
    await store().recordLatePayment(orderId, 95_000);

    const [first] = await db
      .select({ sats: bitcoinPaymentIntents.latePaymentSats, seenAt: bitcoinPaymentIntents.latePaymentSeenAt })
      .from(bitcoinPaymentIntents);

    await store().recordLatePayment(orderId, 1);

    const [second] = await db
      .select({ sats: bitcoinPaymentIntents.latePaymentSats, seenAt: bitcoinPaymentIntents.latePaymentSeenAt })
      .from(bitcoinPaymentIntents);

    expect(second?.sats).toBe(first?.sats);
    expect(second?.seenAt?.getTime()).toBe(first?.seenAt?.getTime());
    expect(await store().countLatePayments()).toBe(1);
  });

  it('round-trips the observed amount, not just the flags', async () => {
    // Finding 3: the watcher used to compute this every pass and discard it, so
    // an underpaid order recorded *that* it was short and never *by how much*.
    const orderId = await seedIntent(db as DB, { status: 'awaiting' });

    await store().recordProgress(orderId, {
      confirmations: 2,
      confirmedSats: 62_500,
      underpaid: true,
      overpaid: false,
    });

    const intent = await store().getByOrderId(orderId);
    expect(intent?.confirmedSats).toBe(62_500);
    expect(intent?.expectedSats).toBe(100_000);
    expect(intent?.underpaid).toBe(true);
  });

  it('defaults the observed amount to 0 rather than null', async () => {
    // 0 says "polled and saw nothing" honestly, and matches `confirmations`.
    // A paid order still reading 0 therefore means "recorded before 0030",
    // which is what lets the revenue report fall back safely.
    const orderId = await seedIntent(db as DB, { status: 'awaiting' });

    expect((await store().getByOrderId(orderId))?.confirmedSats).toBe(0);
  });

  it('counts zero when nothing has been flagged', async () => {
    await seedIntent(db as DB, { status: 'expired' });

    expect(await store().countLatePayments()).toBe(0);
  });
});

/**
 * Whether an address is still being polled decides whether a top-up can ever
 * land. `findExpiredAwaitingOrderIds` only expires `pending` and
 * `awaiting_payment`, so an underpaid order stays *open* until the 48-hour
 * stuck-fail — but this query used to drop it from watching at the 24-hour order
 * deadline. Between those two points the order invited a top-up nobody would see.
 */
describe('DrizzleBitcoinPaymentStore#listWatchable (integration)', () => {
  const { db } = useTestInfrastructure();
  const store = () => new DrizzleBitcoinPaymentStore(db as DB);

  const future = new Date(Date.now() + 60 * 60 * 1000);
  const wellPast = new Date(Date.now() - 48 * 60 * 60 * 1000);

  let n = 0;
  async function seed(paymentStatus: string, paymentDeadlineAt: Date, intentStatus = 'awaiting') {
    n += 1;
    const orderId = `w-order-${n}`;
    await db.insert(orders).values({
      id: orderId,
      currency: 'USD',
      amountMinor: 1999,
      shippingAmountMinor: 0,
      discountAmountMinor: 0,
      customerEmail: 'buyer@example.com',
      paymentStatus,
      paymentDeadlineAt,
    });
    await db.insert(bitcoinPaymentIntents).values({
      orderId,
      address: `bc1qwatch${n}`,
      addressIndex: 1000 + n,
      expectedSats: 100_000,
      fiatCurrency: 'USD',
      satsPerFiatUnit: 1_000,
      expiresAt: new Date('2026-07-01T00:00:00Z'),
      status: intentStatus,
    });
    return orderId;
  }

  it('watches an order still inside its payment window', async () => {
    const orderId = await seed('awaiting_payment', future);

    expect((await store().listWatchable()).map((i) => i.orderId)).toEqual([orderId]);
  });

  it('stops watching an unpaid order past its deadline', async () => {
    // Nothing was ever seen on-chain, so the order is about to be expired and
    // there is nothing to wait for. SweepLatePayments covers it from here.
    await seed('awaiting_payment', wellPast);

    expect(await store().listWatchable()).toEqual([]);
  });

  it('keeps watching an underpaid order past its deadline, so a top-up can land', async () => {
    // The point of the whole change: money has already arrived, the order stays
    // open until the stuck-fail, and the customer has been told to send the
    // rest to this address.
    const orderId = await seed('awaiting_confirmation', wellPast);

    expect((await store().listWatchable()).map((i) => i.orderId)).toEqual([orderId]);
  });

  it('stops watching once the order has been failed', async () => {
    // The bound is automatic: FailStuckAwaitingConfirmationOrders moves it out
    // of awaiting_confirmation at 48h, and it drops out here with no separate
    // horizon to keep in sync.
    await seed('failed', wellPast);

    expect(await store().listWatchable()).toEqual([]);
  });

  it('never watches an intent that is no longer awaiting', async () => {
    await seed('awaiting_confirmation', future, 'confirmed');
    await seed('awaiting_confirmation', future, 'expired');
    await seed('awaiting_confirmation', future, 'cancelled');

    expect(await store().listWatchable()).toEqual([]);
  });
});
