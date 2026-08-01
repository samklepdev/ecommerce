import { describe, expect, it } from 'vitest';

import { DrizzleSupplierOrderRepository } from './drizzle-supplier-order-repository';
import {
  orderLines,
  orders,
  supplierOrderLines,
  supplierOrders,
} from '@/shared/infrastructure/db/schema';
import type { DB } from '@/shared/infrastructure/db/client';
import { makeProduct, makeSupplier } from '../../../../tests/integration/factories';
import { useTestInfrastructure } from '../../../../tests/integration/harness';

/**
 * `allShippedForOrder` decides whether an order advances to `shipped`, after
 * which `MarkDeliveredButton` offers `delivered`. It asked the wrong question:
 * "have all the *supplier orders* shipped", never "is every *order line*
 * actually covered by one".
 *
 * `CreateSupplierOrdersForPaidOrder` only creates supplier orders for lines it
 * can source and flags the rest, so a two-line order with one unsourceable
 * line has exactly one supplier order. Shipping it therefore advanced the
 * whole order — telling the customer their complete order was on its way, and
 * then delivered, while half of it had never been bought.
 *
 * Both halves are `WHERE` clauses, so only real SQL can show it.
 */
describe('DrizzleSupplierOrderRepository#allShippedForOrder (integration)', () => {
  const { db } = useTestInfrastructure();
  const repo = () => new DrizzleSupplierOrderRepository(db as DB);

  let seq = 0;
  /**
   * One order, one line per entry. `sourced` puts the line on a supplier order
   * with the given status; otherwise the line exists with nothing covering it,
   * which is what an unsourceable line looks like.
   */
  async function seedOrder(lines: { sourced?: string | null }[]) {
    seq += 1;
    const orderId = `so-order-${seq}`;
    await db.insert(orders).values({
      id: orderId,
      currency: 'USD',
      amountMinor: 1999,
      shippingAmountMinor: 0,
      discountAmountMinor: 0,
      customerEmail: 'buyer@example.com',
      paymentStatus: 'paid',
    });

    for (const [i, line] of lines.entries()) {
      const product = await makeProduct(db as DB, { slug: `sop-${seq}-${i}` });
      const lineId = `so-line-${seq}-${i}`;
      await db.insert(orderLines).values({
        id: lineId,
        orderId,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitAmountMinor: 1999,
      });

      if (line.sourced) {
        const supplier = await makeSupplier(db as DB, { name: `Supplier ${seq}-${i}` });
        const supplierOrderId = `so-${seq}-${i}`;
        await db.insert(supplierOrders).values({
          id: supplierOrderId,
          orderId,
          supplierId: supplier.id,
          costTotalMinor: 500,
          costCurrency: 'USD',
          status: line.sourced,
        });
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

  it('is true when every line is covered and every parcel has shipped', async () => {
    const orderId = await seedOrder([{ sourced: 'shipped' }, { sourced: 'shipped' }]);

    expect(await repo().allShippedForOrder(orderId)).toBe(true);
  });

  it('is false while a parcel is still outstanding', async () => {
    const orderId = await seedOrder([{ sourced: 'shipped' }, { sourced: 'ordered' }]);

    expect(await repo().allShippedForOrder(orderId)).toBe(false);
  });

  it('is false when a line was never sourced at all', async () => {
    // The defect. One line shipped, one line nobody could buy — the customer
    // would have been told the whole order was on its way.
    const orderId = await seedOrder([{ sourced: 'shipped' }, {}]);

    expect(await repo().allShippedForOrder(orderId)).toBe(false);
  });

  it('is false for an order with lines and no supplier orders whatsoever', async () => {
    const orderId = await seedOrder([{}]);

    expect(await repo().allShippedForOrder(orderId)).toBe(false);
  });

  it('still ignores a cancelled parcel when its line is covered', async () => {
    // A cancelled supplier order still counts as having covered the line —
    // reviving it is an ops decision, not something this should infer. So an
    // order whose other parcel shipped is complete.
    const orderId = await seedOrder([{ sourced: 'shipped' }, { sourced: 'cancelled' }]);

    expect(await repo().allShippedForOrder(orderId)).toBe(true);
  });
});
