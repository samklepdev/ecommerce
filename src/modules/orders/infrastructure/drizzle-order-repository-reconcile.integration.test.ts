import { describe, expect, it } from 'vitest';

import { DrizzleOrderRepository } from './drizzle-order-repository';
import { eq } from 'drizzle-orm';

import {
  orderEvents,
  orderLines,
  orders,
  supplierOrderLines,
  supplierOrders,
} from '@/shared/infrastructure/db/schema';
import type { DB } from '@/shared/infrastructure/db/client';
import { makeProduct, makeSupplier } from '../../../../tests/integration/factories';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * `findPaidOrderIdsWithUnattemptedLines` is two nested negatives — "no supplier
 * order line" inside "no fulfillment issue" — and getting either backwards
 * fails quietly in opposite, equally bad directions: miss a stranded paid order
 * forever, or re-queue every known-unsourceable line on every watcher pass.
 *
 * A fake repository would be a second implementation of that logic and could
 * not disagree with itself, which is why this runs against real SQL.
 */
/**
 * The compare-and-set that stops an admin's Fail click from overwriting a
 * payment that confirmed a moment earlier. The guard is a SQL `WHERE` clause,
 * so only real SQL can prove it — a fake repository would just be a second
 * implementation of the same rule.
 */
describe('setPaymentStatus compare-and-set (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleOrderRepository(db as DB);

  let n = 0;
  async function seedOrder(paymentStatus: string) {
    n += 1;
    const id = `cas-order-${n}`;
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

  async function statusOf(id: string) {
    const [row] = await db.select({ s: orders.paymentStatus }).from(orders).where(eq(orders.id, id));
    return row?.s;
  }

  it('applies when the row is still in the expected status', async () => {
    const id = await seedOrder('awaiting_confirmation');

    expect(await repo().setPaymentStatus(id, 'failed', 'awaiting_confirmation')).toBe(true);
    expect(await statusOf(id)).toBe('failed');
  });

  it('refuses, and changes nothing, when the row has moved on', async () => {
    // The race: the admin read `awaiting_confirmation`, but the watcher has
    // since written `paid`. The write must not land.
    const id = await seedOrder('paid');

    expect(await repo().setPaymentStatus(id, 'failed', 'awaiting_confirmation')).toBe(false);
    expect(await statusOf(id)).toBe('paid');
  });

  it('does not record a status event for a write that did not apply', async () => {
    // A rejected write must leave no trace in the order's timeline either —
    // otherwise the customer-visible history claims a transition that never
    // happened.
    const id = await seedOrder('paid');
    await repo().setPaymentStatus(id, 'failed', 'awaiting_confirmation');

    const events = await db
      .select({ t: orderEvents.eventType })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id));
    expect(events).toEqual([]);
  });

  it('reports false for an order that does not exist', async () => {
    expect(await repo().setPaymentStatus('no-such-order', 'failed', 'pending')).toBe(false);
  });
});

describe('findPaidOrderIdsWithUnattemptedLines (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleOrderRepository(db as DB);

  /** The cutoff the use case would pass: "now minus fifteen minutes". An order
   * is a candidate only if it was last touched BEFORE this. */
  const cutoff = new Date('2026-07-31T11:45:00Z');
  /** Default seed value — comfortably before the cutoff, so it qualifies. */
  const longIdle = new Date('2026-07-01T00:00:00Z');
  /** After the cutoff: touched too recently to be considered lost. */
  const justNow = new Date('2026-07-31T11:59:00Z');

  let seq = 0;
  async function seedOrder(opts: {
    paymentStatus?: string;
    updatedAt?: Date;
    lines: { sourced?: boolean; issue?: string | null }[];
  }) {
    seq += 1;
    const orderId = `order-${seq}`;
    await db.insert(orders).values({
      id: orderId,
      currency: 'USD',
      amountMinor: 1999,
      shippingAmountMinor: 0,
      discountAmountMinor: 0,
      customerEmail: 'buyer@example.com',
      paymentStatus: opts.paymentStatus ?? 'paid',
      updatedAt: opts.updatedAt ?? longIdle,
    });

    let supplierOrderId: string | null = null;
    for (const [i, line] of opts.lines.entries()) {
      const product = await makeProduct(db as DB, { slug: `p-${seq}-${i}` });
      const lineId = `line-${seq}-${i}`;
      await db.insert(orderLines).values({
        id: lineId,
        orderId,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitAmountMinor: 1999,
        fulfillmentIssue: line.issue ?? null,
      });

      if (line.sourced) {
        if (!supplierOrderId) {
          const supplier = await makeSupplier(db as DB, { name: `Supplier ${seq}` });
          supplierOrderId = `so-${seq}`;
          await db.insert(supplierOrders).values({
            id: supplierOrderId,
            orderId,
            supplierId: supplier.id,
            costTotalMinor: 500,
            costCurrency: 'USD',
          });
        }
        await db.insert(supplierOrderLines).values({
          id: `sol-${seq}-${i}`,
          supplierOrderId,
          orderLineId: lineId,
          productId: product.id,
          quantity: 1,
          unitCostMinor: 500,
        });
      }
    }
    return orderId;
  }

  it('finds a paid order whose line was never sourced and never flagged', async () => {
    const orderId = await seedOrder({ lines: [{}] });

    expect(await repo().findPaidOrderIdsWithUnattemptedLines(cutoff)).toEqual([orderId]);
  });

  it('ignores a line a supplier order already covers', async () => {
    await seedOrder({ lines: [{ sourced: true }] });

    expect(await repo().findPaidOrderIdsWithUnattemptedLines(cutoff)).toEqual([]);
  });

  it('ignores a flagged line — that is a known problem, already in the admin queue', async () => {
    // The critical negative. Re-queueing these would log a warning on every
    // watcher pass forever and fix nothing.
    await seedOrder({ lines: [{ issue: 'no_supplier_offer' }] });

    expect(await repo().findPaidOrderIdsWithUnattemptedLines(cutoff)).toEqual([]);
  });

  it('finds an order where only some lines were sourced', async () => {
    // Partial sourcing is the realistic shape of a lost job: one supplier's
    // lines got written, another's did not.
    const orderId = await seedOrder({ lines: [{ sourced: true }, {}] });

    expect(await repo().findPaidOrderIdsWithUnattemptedLines(cutoff)).toEqual([orderId]);
  });

  it('returns an order once, not once per outstanding line', async () => {
    const orderId = await seedOrder({ lines: [{}, {}, {}] });

    expect(await repo().findPaidOrderIdsWithUnattemptedLines(cutoff)).toEqual([orderId]);
  });

  it('ignores orders that are not paid', async () => {
    for (const paymentStatus of ['pending', 'awaiting_payment', 'awaiting_confirmation', 'expired', 'failed', 'cancelled']) {
      await seedOrder({ paymentStatus, lines: [{}] });
    }

    expect(await repo().findPaidOrderIdsWithUnattemptedLines(cutoff)).toEqual([]);
  });

  it('leaves a just-paid order alone until it has been idle a while', async () => {
    // The grace period: without it this fires in the seconds between
    // ConfirmPayment marking the order paid and the sourcing job running.
    await seedOrder({ updatedAt: justNow, lines: [{}] });

    expect(await repo().findPaidOrderIdsWithUnattemptedLines(cutoff)).toEqual([]);
  });
});
