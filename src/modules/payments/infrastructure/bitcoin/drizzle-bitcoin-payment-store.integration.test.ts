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
    opts: {
      status: string;
      createdAt?: Date;
      latePaymentSeenAt?: Date;
      /** The *order's* payment status. Defaults to a terminal one, since that's
       * what makes an intent sweepable. */
      orderStatus?: string;
    },
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
      paymentStatus: opts.orderStatus ?? 'expired',
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

  it('returns every closed order, and nothing still live', async () => {
    // Keyed on the ORDER's status, not the intent's — see the query's comment.
    // The intent status varies here deliberately: it is not what decides this,
    // and a failed order's intent is never marked at all.
    const expired = await seedIntent(db as DB, { status: 'expired', orderStatus: 'expired' });
    const cancelled = await seedIntent(db as DB, { status: 'cancelled', orderStatus: 'cancelled' });
    const failed = await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'failed' });
    // Still collecting, or settled through the normal path.
    await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'awaiting_payment' });
    await seedIntent(db as DB, { status: 'confirmed', orderStatus: 'paid' });

    const found = await store().listSweepable(longAgo);

    expect(found.map((i) => i.orderId).sort()).toEqual([cancelled, expired, failed].sort());
  });

  it('still returns an intent that was already flagged', async () => {
    // Inverted deliberately. This used to exclude flagged intents, which meant
    // an address was checked once and never again — so a customer who sent a
    // balance after the order closed was never noticed. `recordLatePayment`
    // reports whether anything changed, so re-sweeping is silent instead.
    const orderId = await seedIntent(db as DB, {
      status: 'expired',
      latePaymentSeenAt: new Date(),
    });

    expect((await store().listSweepable(longAgo)).map((i) => i.orderId)).toEqual([orderId]);
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
    // It stays in the sweep — see above — but a repeat of the same amount
    // reports no change, which is what keeps the hourly pass quiet.
    expect(await store().recordLatePayment(orderId, 95_000)).toBe(false);
  });

  it('does not restate the discovery when the amount is unchanged', async () => {
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

  it('sweeps a failed order, whose intent nothing ever marks', async () => {
    // Neither `FailOrder` nor the stuck-order pass touches the payment intent,
    // so it stays `awaiting` for good. Keyed on the *order's* terminal status
    // rather than the intent's, this is caught anyway — which matters because
    // the underpayment email tells the customer to send the balance to exactly
    // this address, and `failed` is where an underpaid order ends up.
    const orderId = await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'failed' });

    const found = await store().listSweepable(longAgo);

    expect(found.map((i) => i.orderId)).toEqual([orderId]);
  });

  it('does not sweep an order that is still collecting', async () => {
    await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'awaiting_payment' });
    await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'awaiting_confirmation' });

    expect(await store().listSweepable(longAgo)).toEqual([]);
  });

  it('does not sweep an order that was paid', async () => {
    await seedIntent(db as DB, { status: 'confirmed', orderStatus: 'paid' });

    expect(await store().listSweepable(longAgo)).toEqual([]);
  });

  it('keeps sweeping an already-flagged address, so a later top-up is seen', async () => {
    // The address stays reachable after an order fails — it is the one the
    // underpayment email told the customer to send the balance to. Flagging it
    // once and never looking again meant a later payment went unnoticed and
    // `late_payment_sats` permanently understated what was held.
    const orderId = await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'failed' });
    expect(await store().recordLatePayment(orderId, 60_000)).toBe(true);

    const found = await store().listSweepable(longAgo);

    expect(found.map((i) => i.orderId)).toEqual([orderId]);
  });

  it('raises the recorded amount when more arrives', async () => {
    const orderId = await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'failed' });
    await store().recordLatePayment(orderId, 60_000);

    expect(await store().recordLatePayment(orderId, 100_000)).toBe(true);

    const [row] = await db
      .select({ sats: bitcoinPaymentIntents.latePaymentSats })
      .from(bitcoinPaymentIntents);
    expect(row?.sats).toBe(100_000);
  });

  it('reports no change when the same amount is seen again', async () => {
    // What stops an hourly sweep logging the same known problem forever.
    const orderId = await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'failed' });
    await store().recordLatePayment(orderId, 60_000);

    expect(await store().recordLatePayment(orderId, 60_000)).toBe(false);
  });

  it('never lowers the recorded amount', async () => {
    // A provider briefly reporting less must not rewrite history downwards.
    const orderId = await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'failed' });
    await store().recordLatePayment(orderId, 100_000);

    expect(await store().recordLatePayment(orderId, 60_000)).toBe(false);

    const [row] = await db
      .select({ sats: bitcoinPaymentIntents.latePaymentSats })
      .from(bitcoinPaymentIntents);
    expect(row?.sats).toBe(100_000);
  });

  it('keeps the first-seen timestamp when the amount grows', async () => {
    // `latePaymentSeenAt` answers "when did we find out", so a top-up must not
    // make a week-old discovery look like it happened just now.
    const orderId = await seedIntent(db as DB, { status: 'awaiting', orderStatus: 'failed' });
    await store().recordLatePayment(orderId, 60_000);
    const [first] = await db
      .select({ seenAt: bitcoinPaymentIntents.latePaymentSeenAt })
      .from(bitcoinPaymentIntents);

    await store().recordLatePayment(orderId, 100_000);

    const [second] = await db
      .select({ seenAt: bitcoinPaymentIntents.latePaymentSeenAt })
      .from(bitcoinPaymentIntents);
    expect(second?.seenAt?.getTime()).toBe(first?.seenAt?.getTime());
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

  it('stops watching an order that has failed, even inside its payment window', async () => {
    // A terminal order can never reach `paid`. Watching one means that if money
    // does arrive, `assertPaymentTransition('failed', 'paid')` throws on every
    // pass — an error loop every 45 seconds that drowns out real ones.
    await seed('failed', future);

    expect(await store().listWatchable()).toEqual([]);
  });

  it('stops watching expired and cancelled orders inside their window too', async () => {
    await seed('expired', future);
    await seed('cancelled', future);

    expect(await store().listWatchable()).toEqual([]);
  });

  it('never watches an intent that is no longer awaiting', async () => {
    await seed('awaiting_confirmation', future, 'confirmed');
    await seed('awaiting_confirmation', future, 'expired');
    await seed('awaiting_confirmation', future, 'cancelled');

    expect(await store().listWatchable()).toEqual([]);
  });
});
