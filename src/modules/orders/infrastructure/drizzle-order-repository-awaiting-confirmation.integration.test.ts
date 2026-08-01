import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { DrizzleOrderRepository } from './drizzle-order-repository';
import { orderEvents, orders } from '@/shared/infrastructure/db/schema';
import type { DB } from '@/shared/infrastructure/db/client';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * `markAwaitingConfirmation`'s guard, against real SQL.
 *
 * This exists because the unit test for the same behaviour passes while the
 * adapter is broken: it drives a fake repository that sets the status
 * unconditionally, so it is a second implementation of the rule and cannot
 * disagree with itself. The rule lives entirely in a `WHERE` clause, and only
 * Postgres can say whether that clause matches.
 *
 * What was wrong: the domain and the use case were both taught that a
 * `pending` order can hold a live payment address (`StartCheckout` derives the
 * address and *then* records `awaiting_payment`, so a crash between the two
 * leaves exactly that state, with the BIP21 URI already in the customer's
 * hands). The adapter still matched `awaiting_payment` alone, so the write
 * silently matched zero rows.
 *
 * The damage was not "a status is slightly wrong". The order stayed `pending`,
 * which is in `findExpiredAwaitingOrderIds`' set — so instead of getting the
 * 48-hour top-up window it was expired at the 24-hour deadline; and
 * `awaitingConfirmationSince` was never stamped, so `formatTopUpDeadline`
 * returned null and the "you still owe" email went out with no deadline in it
 * at all.
 */
describe('markAwaitingConfirmation (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleOrderRepository(db as DB);

  let n = 0;
  async function seedOrder(paymentStatus: string) {
    n += 1;
    const id = `mac-order-${n}`;
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

  async function rowOf(id: string) {
    const [row] = await db
      .select({
        status: orders.paymentStatus,
        since: orders.awaitingConfirmationSince,
      })
      .from(orders)
      .where(eq(orders.id, id));
    return row;
  }

  it('advances an awaiting_payment order and stamps the clock', async () => {
    const id = await seedOrder('awaiting_payment');

    await repo().markAwaitingConfirmation(id);

    const row = await rowOf(id);
    expect(row?.status).toBe('awaiting_confirmation');
    expect(row?.since).toBeInstanceOf(Date);
  });

  it('advances a pending order that already has a payment address', async () => {
    // The regression. A `pending` order whose checkout crashed after deriving
    // the address is exactly the case the domain was widened for.
    const id = await seedOrder('pending');

    await repo().markAwaitingConfirmation(id);

    const row = await rowOf(id);
    expect(row?.status).toBe('awaiting_confirmation');
    // Without this the 48h top-up clock never starts, so the deadline the
    // balance email is supposed to carry is null.
    expect(row?.since).toBeInstanceOf(Date);
  });

  it('records a status event for a pending order it advanced', async () => {
    const id = await seedOrder('pending');

    await repo().markAwaitingConfirmation(id);

    const events = await db
      .select({ status: orderEvents.status })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id));
    expect(events.map((e) => e.status)).toContain('awaiting_confirmation');
  });

  it('does not re-stamp the clock on a repeat pass', async () => {
    // The watcher re-runs every 45s for as long as an order is short, and
    // `FailStuckAwaitingConfirmationOrders` measures the terminal 48h window
    // from this timestamp — re-stamping would make the window never end.
    const id = await seedOrder('awaiting_payment');
    await repo().markAwaitingConfirmation(id);
    const first = (await rowOf(id))?.since;

    await repo().markAwaitingConfirmation(id);

    expect((await rowOf(id))?.since).toEqual(first);
  });

  it('leaves a paid order alone', async () => {
    const id = await seedOrder('paid');

    await repo().markAwaitingConfirmation(id);

    const row = await rowOf(id);
    expect(row?.status).toBe('paid');
    expect(row?.since).toBeNull();
  });

  it('leaves a terminal order alone', async () => {
    for (const status of ['failed', 'expired', 'cancelled']) {
      const id = await seedOrder(status);

      await repo().markAwaitingConfirmation(id);

      expect((await rowOf(id))?.status).toBe(status);
    }
  });

  it('records no event for a write that did not apply', async () => {
    const id = await seedOrder('paid');

    await repo().markAwaitingConfirmation(id);

    const events = await db
      .select({ status: orderEvents.status })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id));
    expect(events).toEqual([]);
  });
});