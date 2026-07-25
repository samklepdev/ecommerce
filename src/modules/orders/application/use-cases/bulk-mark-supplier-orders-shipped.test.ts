import { describe, expect, it } from 'vitest';

import { BulkMarkSupplierOrdersShipped } from './bulk-mark-supplier-orders-shipped';
import { MarkSupplierOrderShipped } from './mark-supplier-order-shipped';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';

function makeMarkShipped(failingIds: Set<string>, guardedFalseIds: Set<string> = new Set()) {
  const shipped: { supplierOrderId: string; trackingNumber: string; carrier?: string | null }[] = [];
  const supplierOrders: Partial<SupplierOrderRepository> = {
    async markShipped(supplierOrderId, trackingNumber, carrier) {
      if (failingIds.has(supplierOrderId)) throw new Error('db restrict');
      if (guardedFalseIds.has(supplierOrderId)) return false;
      shipped.push({ supplierOrderId, trackingNumber, carrier });
      return true;
    },
    async allShippedForOrder() {
      return false;
    },
  };
  const orders: Partial<OrderFulfillmentRepository> = {};
  return {
    markShipped: new MarkSupplierOrderShipped(
      supplierOrders as SupplierOrderRepository,
      orders as OrderFulfillmentRepository,
    ),
    shipped,
  };
}

describe('BulkMarkSupplierOrdersShipped', () => {
  it('marks every selected supplier order shipped and reports zero failures', async () => {
    const { markShipped, shipped } = makeMarkShipped(new Set());

    const result = await new BulkMarkSupplierOrdersShipped(markShipped).execute({
      supplierOrderIds: ['so1', 'so2'],
      orderId: 'order1',
      trackingNumber: 'TRACK-1',
      carrier: 'ups',
    });

    expect(result).toEqual({ updated: 2, failed: 0 });
    expect(shipped).toEqual([
      { supplierOrderId: 'so1', trackingNumber: 'TRACK-1', carrier: 'ups' },
      { supplierOrderId: 'so2', trackingNumber: 'TRACK-1', carrier: 'ups' },
    ]);
  });

  it('continues past a failure and counts it separately', async () => {
    const { markShipped, shipped } = makeMarkShipped(new Set(['so2']));

    const result = await new BulkMarkSupplierOrdersShipped(markShipped).execute({
      supplierOrderIds: ['so1', 'so2', 'so3'],
      orderId: 'order1',
      trackingNumber: 'TRACK-1',
    });

    expect(result).toEqual({ updated: 2, failed: 1 });
    expect(shipped.map((s) => s.supplierOrderId)).toEqual(['so1', 'so3']);
  });

  it('counts a guarded false as a failure, not an update', async () => {
    const { markShipped } = makeMarkShipped(new Set(), new Set(['so1']));

    const result = await new BulkMarkSupplierOrdersShipped(markShipped).execute({
      supplierOrderIds: ['so1'],
      orderId: 'order1',
      trackingNumber: 'TRACK-1',
    });

    expect(result).toEqual({ updated: 0, failed: 1 });
  });

  it('does nothing for an empty id list', async () => {
    const { markShipped } = makeMarkShipped(new Set());

    const result = await new BulkMarkSupplierOrdersShipped(markShipped).execute({
      supplierOrderIds: [],
      orderId: 'order1',
      trackingNumber: 'TRACK-1',
    });

    expect(result).toEqual({ updated: 0, failed: 0 });
  });
});
