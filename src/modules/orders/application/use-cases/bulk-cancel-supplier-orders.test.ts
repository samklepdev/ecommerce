import { describe, expect, it } from 'vitest';

import { BulkCancelSupplierOrders } from './bulk-cancel-supplier-orders';
import { CancelSupplierOrder } from './cancel-supplier-order';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';

function makeCancel(failingIds: Set<string>, guardedFalseIds: Set<string> = new Set()) {
  const cancelled: string[] = [];
  const supplierOrders: Partial<SupplierOrderRepository> = {
    async cancel(supplierOrderId) {
      if (failingIds.has(supplierOrderId)) throw new Error('db restrict');
      if (guardedFalseIds.has(supplierOrderId)) return false;
      cancelled.push(supplierOrderId);
      return true;
    },
    async allCancelledForOrder() {
      return false;
    },
  };
  const orders: Partial<OrderFulfillmentRepository> = {};
  return {
    cancelSupplierOrder: new CancelSupplierOrder(
      supplierOrders as SupplierOrderRepository,
      orders as OrderFulfillmentRepository,
    ),
    cancelled,
  };
}

describe('BulkCancelSupplierOrders', () => {
  it('cancels every selected supplier order and reports zero failures', async () => {
    const { cancelSupplierOrder, cancelled } = makeCancel(new Set());

    const result = await new BulkCancelSupplierOrders(cancelSupplierOrder).execute({
      supplierOrderIds: ['so1', 'so2'],
      orderId: 'order1',
    });

    expect(result).toEqual({ updated: 2, failed: 0 });
    expect(cancelled).toEqual(['so1', 'so2']);
  });

  it('continues past a failure and counts it separately', async () => {
    const { cancelSupplierOrder, cancelled } = makeCancel(new Set(['so2']));

    const result = await new BulkCancelSupplierOrders(cancelSupplierOrder).execute({
      supplierOrderIds: ['so1', 'so2', 'so3'],
      orderId: 'order1',
    });

    expect(result).toEqual({ updated: 2, failed: 1 });
    expect(cancelled).toEqual(['so1', 'so3']);
  });

  it('counts a guarded false as a failure, not an update', async () => {
    const { cancelSupplierOrder } = makeCancel(new Set(), new Set(['so1']));

    const result = await new BulkCancelSupplierOrders(cancelSupplierOrder).execute({
      supplierOrderIds: ['so1'],
      orderId: 'order1',
    });

    expect(result).toEqual({ updated: 0, failed: 1 });
  });

  it('does nothing for an empty id list', async () => {
    const { cancelSupplierOrder } = makeCancel(new Set());

    const result = await new BulkCancelSupplierOrders(cancelSupplierOrder).execute({
      supplierOrderIds: [],
      orderId: 'order1',
    });

    expect(result).toEqual({ updated: 0, failed: 0 });
  });
});
