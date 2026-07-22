import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { orderLines, supplierOrderLines, supplierOrders } from '@/shared/infrastructure/db/schema';
import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';
import type {
  CreateSupplierOrderInput,
  SupplierOrderRepository,
  SupplierOrderSummary,
  SupplierOrderSummaryLine,
} from '@/modules/orders/application/ports/supplier-order-repository';

type SupplierOrderRow = typeof supplierOrders.$inferSelect;

function toSummary(row: SupplierOrderRow, lines: SupplierOrderSummaryLine[]): SupplierOrderSummary {
  return {
    id: row.id,
    orderId: row.orderId,
    supplierId: row.supplierId,
    status: row.status as SupplierOrderStatus,
    supplierOrderReference: row.supplierOrderReference,
    costTotalMinor: row.costTotalMinor,
    costCurrency: row.costCurrency,
    trackingNumber: row.trackingNumber,
    carrier: row.carrier,
    createdAt: row.createdAt,
    lines,
  };
}

export class DrizzleSupplierOrderRepository implements SupplierOrderRepository {
  constructor(private readonly db: DB) {}

  async createForPaidOrder(inputs: CreateSupplierOrderInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const input of inputs) {
        const supplierOrderId = randomUUID();
        const costTotalMinor = input.lines.reduce(
          (sum, l) => sum + l.unitCostMinor * l.quantity,
          0,
        );
        const costCurrency = input.lines[0]?.costCurrency ?? 'USD';

        await tx.insert(supplierOrders).values({
          id: supplierOrderId,
          orderId: input.orderId,
          supplierId: input.supplierId,
          status: 'needs_ordering',
          costTotalMinor,
          costCurrency,
        });

        await tx.insert(supplierOrderLines).values(
          input.lines.map((l) => ({
            id: randomUUID(),
            supplierOrderId,
            orderLineId: l.orderLineId,
            variantId: l.variantId,
            quantity: l.quantity,
            unitCostMinor: l.unitCostMinor,
          })),
        );
      }
    });
  }

  async listNeedingAction(): Promise<SupplierOrderSummary[]> {
    const rows = await this.db.query.supplierOrders.findMany({
      where: inArray(supplierOrders.status, ['needs_ordering', 'ordered']),
    });
    return this.hydrateLines(rows);
  }

  async listByOrderId(orderId: string): Promise<SupplierOrderSummary[]> {
    const rows = await this.db.query.supplierOrders.findMany({
      where: eq(supplierOrders.orderId, orderId),
    });
    return this.hydrateLines(rows);
  }

  async listByStatus(status?: SupplierOrderStatus): Promise<SupplierOrderSummary[]> {
    const rows = await this.db.query.supplierOrders.findMany({
      where: status ? eq(supplierOrders.status, status) : undefined,
    });
    return this.hydrateLines(rows);
  }

  /** Joins each supplier-order row with its line items — shared by every
   * method that returns `SupplierOrderSummary[]`. */
  private async hydrateLines(rows: SupplierOrderRow[]): Promise<SupplierOrderSummary[]> {
    if (rows.length === 0) return [];

    const lineRows = await this.db
      .select({
        supplierOrderId: supplierOrderLines.supplierOrderId,
        variantId: supplierOrderLines.variantId,
        quantity: supplierOrderLines.quantity,
        unitCostMinor: supplierOrderLines.unitCostMinor,
        sku: orderLines.sku,
      })
      .from(supplierOrderLines)
      .innerJoin(orderLines, eq(supplierOrderLines.orderLineId, orderLines.id))
      .where(
        inArray(
          supplierOrderLines.supplierOrderId,
          rows.map((r) => r.id),
        ),
      );

    const linesBySupplierOrder = new Map<string, SupplierOrderSummaryLine[]>();
    for (const line of lineRows) {
      const list = linesBySupplierOrder.get(line.supplierOrderId) ?? [];
      list.push({
        variantId: line.variantId,
        sku: line.sku,
        quantity: line.quantity,
        unitCostMinor: line.unitCostMinor,
      });
      linesBySupplierOrder.set(line.supplierOrderId, list);
    }

    return rows.map((row) => toSummary(row, linesBySupplierOrder.get(row.id) ?? []));
  }

  async markOrdered(supplierOrderId: string, reference: string): Promise<boolean> {
    const result = await this.db
      .update(supplierOrders)
      .set({ status: 'ordered', supplierOrderReference: reference, updatedAt: new Date() })
      .where(and(eq(supplierOrders.id, supplierOrderId), eq(supplierOrders.status, 'needs_ordering')))
      .returning({ id: supplierOrders.id });
    return result.length > 0;
  }

  async markShipped(
    supplierOrderId: string,
    trackingNumber: string,
    carrier?: string | null,
  ): Promise<boolean> {
    const result = await this.db
      .update(supplierOrders)
      .set({ status: 'shipped', trackingNumber, carrier: carrier ?? null, updatedAt: new Date() })
      .where(and(eq(supplierOrders.id, supplierOrderId), eq(supplierOrders.status, 'ordered')))
      .returning({ id: supplierOrders.id });
    return result.length > 0;
  }

  async updateReference(supplierOrderId: string, reference: string): Promise<void> {
    await this.db
      .update(supplierOrders)
      .set({ supplierOrderReference: reference, updatedAt: new Date() })
      .where(eq(supplierOrders.id, supplierOrderId));
  }

  async updateTrackingNumber(
    supplierOrderId: string,
    trackingNumber: string,
    carrier?: string | null,
  ): Promise<void> {
    // `carrier` is only written when explicitly passed — omitting it (vs.
    // passing null) must not silently wipe a carrier set earlier.
    await this.db
      .update(supplierOrders)
      .set({
        trackingNumber,
        updatedAt: new Date(),
        ...(carrier !== undefined ? { carrier } : {}),
      })
      .where(eq(supplierOrders.id, supplierOrderId));
  }

  async cancel(supplierOrderId: string): Promise<boolean> {
    const result = await this.db
      .update(supplierOrders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(supplierOrders.id, supplierOrderId),
          inArray(supplierOrders.status, ['needs_ordering', 'ordered']),
        ),
      )
      .returning({ id: supplierOrders.id });
    return result.length > 0;
  }

  async allShippedForOrder(orderId: string): Promise<boolean> {
    const rows = await this.db.query.supplierOrders.findMany({
      where: and(eq(supplierOrders.orderId, orderId), ne(supplierOrders.status, 'cancelled')),
      columns: { status: true },
    });
    if (rows.length === 0) return false;
    return rows.every((r) => r.status === 'shipped');
  }

  async allCancelledForOrder(orderId: string): Promise<boolean> {
    const rows = await this.db.query.supplierOrders.findMany({
      where: eq(supplierOrders.orderId, orderId),
      columns: { status: true },
    });
    if (rows.length === 0) return false;
    return rows.every((r) => r.status === 'cancelled');
  }
}
