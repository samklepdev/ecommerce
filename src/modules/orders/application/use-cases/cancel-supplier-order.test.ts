import { describe, expect, it } from 'vitest';

import { CancelSupplierOrder } from './cancel-supplier-order';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

function makeFakeSupplierOrders(opts: { cancelResult: boolean; allCancelled: boolean }) {
  const repo: Partial<SupplierOrderRepository> = {
    async cancel() {
      return opts.cancelResult;
    },
    async allCancelledForOrder() {
      return opts.allCancelled;
    },
  };
  return repo as SupplierOrderRepository;
}

function makeFakeOrderFulfillment(paymentStatus: PaymentStatus | null, fulfillmentStatus: FulfillmentStatus | null) {
  let currentFulfillment = fulfillmentStatus;
  const repo: OrderFulfillmentRepository = {
    async getPaymentStatus() {
      return paymentStatus;
    },
    async getFulfillmentStatus() {
      return currentFulfillment;
    },
    async setFulfillmentStatus(_orderId, status, expectedFrom) {
      // Mirrors the repository's compare-and-set, so a test cannot pass
      // against a fake more permissive than the database.
      if (currentFulfillment !== expectedFrom) return false;
      currentFulfillment = status;
      return true;
    },
  };
  return { repo, getFulfillment: () => currentFulfillment };
}

describe('CancelSupplierOrder', () => {
  it('returns cancelled: false without touching the order when the guarded cancel rejects', async () => {
    const supplierOrders = makeFakeSupplierOrders({ cancelResult: false, allCancelled: false });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    const result = await new CancelSupplierOrder(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
    });

    expect(result).toEqual({ cancelled: false });
    expect(getFulfillment()).toBe('processing'); // unchanged
  });

  it('returns cancelled: true without advancing the order when a sibling supplier order is still active', async () => {
    const supplierOrders = makeFakeSupplierOrders({ cancelResult: true, allCancelled: false });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    const result = await new CancelSupplierOrder(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
    });

    expect(result).toEqual({ cancelled: true });
    expect(getFulfillment()).toBe('processing'); // still fulfillable via the other supplier order
  });

  it('advances the order to cancelled once every supplier order is cancelled', async () => {
    const supplierOrders = makeFakeSupplierOrders({ cancelResult: true, allCancelled: true });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    const result = await new CancelSupplierOrder(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
    });

    expect(result).toEqual({ cancelled: true });
    expect(getFulfillment()).toBe('cancelled');
  });

  it('is idempotent — a no-op when the order already advanced to cancelled', async () => {
    const supplierOrders = makeFakeSupplierOrders({ cancelResult: true, allCancelled: true });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'cancelled');

    const result = await new CancelSupplierOrder(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
    });

    expect(result).toEqual({ cancelled: true });
    expect(getFulfillment()).toBe('cancelled');
  });

  it('never attempts an illegal transition when the order has already shipped/delivered', async () => {
    const supplierOrders = makeFakeSupplierOrders({ cancelResult: true, allCancelled: true });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'shipped');

    const result = await new CancelSupplierOrder(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
    });

    expect(result).toEqual({ cancelled: true });
    expect(getFulfillment()).toBe('shipped'); // unchanged — no illegal shipped -> cancelled attempted
  });

  it('returns cancelled: true without advancing when the order/payment status cannot be read', async () => {
    const supplierOrders = makeFakeSupplierOrders({ cancelResult: true, allCancelled: true });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment(null, null);

    const result = await new CancelSupplierOrder(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
    });

    expect(result).toEqual({ cancelled: true });
    expect(getFulfillment()).toBeNull();
  });
});
