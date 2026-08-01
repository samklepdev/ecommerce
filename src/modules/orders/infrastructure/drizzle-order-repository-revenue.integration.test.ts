import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { DrizzleOrderRepository } from './drizzle-order-repository';
import { bitcoinPaymentIntents, orderLines, orders } from '@/shared/infrastructure/db/schema';
import { makeProduct } from '../../../../tests/integration/factories';
import type { DB } from '@/shared/infrastructure/db/client';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * What "revenue" counts.
 *
 * The query used to sum the `order_created` event with no payment-status
 * predicate anywhere — not in the SQL, not in the use case, not in the pages
 * rendering it. Every abandoned checkout, expired, cancelled and failed order
 * was booked as revenue, on a store where abandonment is the normal outcome.
 *
 * The use case is a pass-through, so all of this behaviour lives in SQL and
 * only real SQL can show it. A fake repository would be a second
 * implementation of the rule and could not disagree with itself.
 */
describe('getDailyRevenue (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleOrderRepository(db as DB);

  const SINCE = new Date('2026-01-01T00:00:00.000Z');
  const UNTIL = new Date('2026-01-31T23:59:59.999Z');

  let n = 0;
  async function seedOrder(opts: {
    paymentStatus: string;
    amountMinor: number;
    paidAt?: Date | null;
    createdAt?: Date;
    quantities?: number[];
  }) {
    n += 1;
    const id = `rev-order-${n}`;
    await db.insert(orders).values({
      id,
      currency: 'USD',
      amountMinor: opts.amountMinor,
      shippingAmountMinor: 0,
      discountAmountMinor: 0,
      customerEmail: 'buyer@example.com',
      paymentStatus: opts.paymentStatus,
      paidAt: opts.paidAt ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    });
    for (const [i, quantity] of (opts.quantities ?? []).entries()) {
      const product = await makeProduct(db as DB);
      await db.insert(orderLines).values({
        id: `${id}-line-${i}`,
        orderId: id,
        productId: product.id,
        productName: product.name,
        quantity,
        unitAmountMinor: 100,
      });
    }
    return id;
  }

  it('counts a paid order', async () => {
    await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 5000,
      paidAt: new Date('2026-01-10T12:00:00.000Z'),
      quantities: [2],
    });

    const { days, currency } = await repo().getDailyRevenue(SINCE, UNTIL);

    expect(currency).toBe('USD');
    expect(days).toEqual([
      { day: '2026-01-10', totalMinor: 5000, orderCount: 1, totalQuantity: 2 },
    ]);
  });

  it('counts nothing for an order that was never paid', async () => {
    // The defect, stated directly. All four of these were revenue before.
    for (const paymentStatus of ['pending', 'awaiting_payment', 'expired', 'cancelled']) {
      await seedOrder({
        paymentStatus,
        amountMinor: 100_000,
        createdAt: new Date('2026-01-10T12:00:00.000Z'),
        quantities: [5],
      });
    }
    await seedOrder({
      paymentStatus: 'failed',
      amountMinor: 100_000,
      createdAt: new Date('2026-01-10T12:00:00.000Z'),
      quantities: [5],
    });

    const { days } = await repo().getDailyRevenue(SINCE, UNTIL);

    expect(days).toEqual([]);
  });

  it('counts an awaiting_confirmation order as nothing — money seen is not money settled', async () => {
    // Underpaid or merely shallow. Either way it may still fail, and failing
    // is terminal, so booking it as revenue would recognise money that may
    // never be the shop's.
    await seedOrder({
      paymentStatus: 'awaiting_confirmation',
      amountMinor: 100_000,
      quantities: [1],
    });

    expect((await repo().getDailyRevenue(SINCE, UNTIL)).days).toEqual([]);
  });

  it('buckets by when the order was paid, not when it was placed', async () => {
    // A customer who places on the 9th and pays on the 11th is revenue on the
    // 11th — that is when the money arrived.
    await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 5000,
      createdAt: new Date('2026-01-09T23:00:00.000Z'),
      paidAt: new Date('2026-01-11T01:00:00.000Z'),
      quantities: [1],
    });

    const { days } = await repo().getDailyRevenue(SINCE, UNTIL);

    expect(days.map((d) => d.day)).toEqual(['2026-01-11']);
  });

  it('reads the order total, so an admin edit is reflected', async () => {
    // The old query read `amountMinor` out of the `order_created` event's
    // metadata — a snapshot written once, so an order edited afterwards
    // reported its pre-edit total in revenue forever.
    const id = await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 5000,
      paidAt: new Date('2026-01-10T12:00:00.000Z'),
      quantities: [1],
    });
    await db.update(orders).set({ amountMinor: 7500 }).where(eq(orders.id, id));

    const { days } = await repo().getDailyRevenue(SINCE, UNTIL);

    expect(days[0]?.totalMinor).toBe(7500);
  });

  it('does not multiply the total by the number of lines', async () => {
    // The trap in summing across a join: three lines must not turn one
    // $50 order into $150 of revenue.
    await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 5000,
      paidAt: new Date('2026-01-10T12:00:00.000Z'),
      quantities: [1, 2, 3],
    });

    const { days } = await repo().getDailyRevenue(SINCE, UNTIL);

    expect(days[0]?.totalMinor).toBe(5000);
    expect(days[0]?.totalQuantity).toBe(6);
    expect(days[0]?.orderCount).toBe(1);
  });

  it('groups several orders onto their own days', async () => {
    await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 1000,
      paidAt: new Date('2026-01-10T09:00:00.000Z'),
      quantities: [1],
    });
    await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 2000,
      paidAt: new Date('2026-01-10T20:00:00.000Z'),
      quantities: [2],
    });
    await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 4000,
      paidAt: new Date('2026-01-12T09:00:00.000Z'),
      quantities: [1],
    });

    const { days } = await repo().getDailyRevenue(SINCE, UNTIL);

    expect(days).toEqual([
      { day: '2026-01-10', totalMinor: 3000, orderCount: 2, totalQuantity: 3 },
      { day: '2026-01-12', totalMinor: 4000, orderCount: 1, totalQuantity: 1 },
    ]);
  });

  it('excludes a paid order outside the range', async () => {
    await seedOrder({
      paymentStatus: 'paid',
      amountMinor: 5000,
      paidAt: new Date('2026-02-02T12:00:00.000Z'),
      quantities: [1],
    });

    expect((await repo().getDailyRevenue(SINCE, UNTIL)).days).toEqual([]);
  });

  it('reports no currency when there is no revenue at all', async () => {
    expect(await repo().getDailyRevenue(SINCE, UNTIL)).toEqual({ currency: null, days: [] });
  });
});

/**
 * `paid_at` is written by the transition to `paid` and by nothing else. Both
 * money reports bucket on it, so a second write — or a missing one — moves
 * money between reporting periods.
 */
describe('paid_at stamping (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleOrderRepository(db as DB);

  let n = 0;
  async function seedOrder(paymentStatus: string) {
    n += 1;
    const id = `paidat-order-${n}`;
    await db.insert(orders).values({
      id,
      currency: 'USD',
      amountMinor: 1999,
      shippingAmountMinor: 0,
      discountAmountMinor: 0,
      customerEmail: 'buyer@example.com',
      paymentStatus,
    });
    return id;
  }

  async function paidAtOf(id: string) {
    const [row] = await db.select({ p: orders.paidAt }).from(orders).where(eq(orders.id, id));
    return row?.p ?? null;
  }

  it('stamps paid_at on the transition to paid', async () => {
    const id = await seedOrder('awaiting_confirmation');

    expect(await repo().setPaymentStatus(id, 'paid', 'awaiting_confirmation')).toBe(true);
    expect(await paidAtOf(id)).toBeInstanceOf(Date);
  });

  it('leaves paid_at null for a transition that is not to paid', async () => {
    const id = await seedOrder('awaiting_confirmation');

    await repo().setPaymentStatus(id, 'failed', 'awaiting_confirmation');

    expect(await paidAtOf(id)).toBeNull();
  });

  it('does not stamp paid_at when the write did not apply', async () => {
    // The compare-and-set lost. Nothing about the row should move, including
    // the timestamp two money reports bucket on.
    const id = await seedOrder('expired');

    expect(await repo().setPaymentStatus(id, 'paid', 'awaiting_confirmation')).toBe(false);
    expect(await paidAtOf(id)).toBeNull();
  });

  it('keeps the first paid_at if a second write to paid ever happens', async () => {
    // `paid` is terminal so this shouldn't be reachable, but the COALESCE is
    // what makes that a property of the SQL rather than of every caller.
    const id = await seedOrder('awaiting_confirmation');
    await repo().setPaymentStatus(id, 'paid', 'awaiting_confirmation');
    const first = await paidAtOf(id);

    await db.update(orders).set({ paymentStatus: 'expired' }).where(eq(orders.id, id));
    await repo().setPaymentStatus(id, 'paid', 'expired');

    expect(await paidAtOf(id)).toEqual(first);
  });
});

/**
 * The admin order filters.
 *
 * Every attention tile on the dashboard counted something and then linked to
 * an unfiltered list, leaving the admin to page through every order in the
 * store reading badges. These filters are what make a tile's count and the
 * list it opens the same set of orders.
 *
 * Integration rather than unit, for two reasons the SQL decides: the count and
 * the page must be filtered identically or the pagination reports a total it
 * can't show, and the late-payment filter is a correlated subquery against
 * another table, which a fake would model as an array lookup and get right
 * for the wrong reasons.
 */
describe('adminOrderFilter (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleOrderRepository(db as DB);

  let n = 0;
  async function seedOrder(opts: {
    paymentStatus?: string;
    fulfillmentStatus?: string;
    email?: string;
    recoveredFrom?: string;
    latePaymentSats?: number;
  }) {
    n += 1;
    const id = `filter-order-${n}`;
    await db.insert(orders).values({
      id,
      currency: 'USD',
      amountMinor: 1999,
      shippingAmountMinor: 0,
      discountAmountMinor: 0,
      customerEmail: opts.email ?? 'buyer@example.com',
      paymentStatus: opts.paymentStatus ?? 'pending',
      fulfillmentStatus: opts.fulfillmentStatus ?? 'unfulfilled',
      paymentRecoveredFrom: opts.recoveredFrom ?? null,
    });
    if (opts.latePaymentSats !== undefined) {
      await db.insert(bitcoinPaymentIntents).values({
        orderId: id,
        address: `bc1qfilter${n}`,
        addressIndex: n,
        expectedSats: 100_000,
        fiatCurrency: 'USD',
        satsPerFiatUnit: 1000,
        expiresAt: new Date(),
        status: 'expired',
        latePaymentSats: opts.latePaymentSats,
        latePaymentSeenAt: new Date(),
      });
    }
    return id;
  }

  async function listIds(filter: Parameters<ReturnType<typeof repo>['listAllForAdmin']>[0]) {
    const rows = await repo().listAllForAdmin(filter, 50, 0);
    return rows.map((r) => r.id).sort();
  }

  it('returns everything when nothing is filtered', async () => {
    await seedOrder({});
    await seedOrder({ paymentStatus: 'paid' });

    expect(await repo().countAllForAdmin({})).toBe(2);
    expect((await listIds({})).length).toBe(2);
  });

  it('filters by payment status', async () => {
    const paid = await seedOrder({ paymentStatus: 'paid' });
    await seedOrder({ paymentStatus: 'expired' });

    expect(await listIds({ paymentStatus: 'paid' })).toEqual([paid]);
    expect(await repo().countAllForAdmin({ paymentStatus: 'paid' })).toBe(1);
  });

  it('filters by fulfillment status', async () => {
    const shipped = await seedOrder({ paymentStatus: 'paid', fulfillmentStatus: 'shipped' });
    await seedOrder({ paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' });

    expect(await listIds({ fulfillmentStatus: 'shipped' })).toEqual([shipped]);
  });

  it('filters to recovered orders', async () => {
    const recovered = await seedOrder({ paymentStatus: 'paid', recoveredFrom: 'expired' });
    await seedOrder({ paymentStatus: 'paid' });

    expect(await listIds({ recovered: true })).toEqual([recovered]);
  });

  it('filters to orders holding a late payment', async () => {
    // The tile that matters most: money already received against an order
    // that will never ship on its own.
    const late = await seedOrder({ paymentStatus: 'expired', latePaymentSats: 95_000 });
    await seedOrder({ paymentStatus: 'expired' });

    expect(await listIds({ latePayment: true })).toEqual([late]);
    expect(await repo().countAllForAdmin({ latePayment: true })).toBe(1);
  });

  it('does not duplicate an order that has a payment intent', async () => {
    // The reason this is a correlated exists rather than a join: a join would
    // need dedup, and a duplicated row would make the page disagree with the
    // count the pagination is built on.
    await seedOrder({ paymentStatus: 'expired', latePaymentSats: 95_000 });

    const rows = await repo().listAllForAdmin({ latePayment: true }, 50, 0);
    expect(rows).toHaveLength(1);
  });

  it('composes filters rather than replacing them', async () => {
    const wanted = await seedOrder({ paymentStatus: 'paid', email: 'target@example.com' });
    await seedOrder({ paymentStatus: 'expired', email: 'target@example.com' });
    await seedOrder({ paymentStatus: 'paid', email: 'someone@example.com' });

    expect(await listIds({ paymentStatus: 'paid', email: 'target@example.com' })).toEqual([wanted]);
  });

  it('counts and lists the same set, so pagination cannot lie', async () => {
    for (let i = 0; i < 3; i += 1) await seedOrder({ paymentStatus: 'paid' });
    await seedOrder({ paymentStatus: 'expired' });

    const filter = { paymentStatus: 'paid' as const };
    expect(await repo().countAllForAdmin(filter)).toBe((await listIds(filter)).length);
  });
});
