import { describe, expect, it } from 'vitest';

import { MarkSupplierOrderShipped } from './mark-supplier-order-shipped';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

function makeFakeSupplierOrders(opts: { markShippedResult: boolean; allShipped: boolean }) {
  const repo: Partial<SupplierOrderRepository> = {
    async markShipped() {
      return opts.markShippedResult;
    },
    async allShippedForOrder() {
      return opts.allShipped;
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
    async setFulfillmentStatus(_orderId, status) {
      currentFulfillment = status;
    },
  };
  return { repo, getFulfillment: () => currentFulfillment };
}

describe('MarkSupplierOrderShipped', () => {
  it('returns false without touching the order when the guarded markShipped rejects', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: false, allShipped: false });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK1',
    });

    expect(result).toBe(false);
    expect(getFulfillment()).toBe('processing'); // unchanged
  });

  it('returns true without advancing the order when not every supplier order has shipped yet', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: true, allShipped: false });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK1',
    });

    expect(result).toBe(true);
    expect(getFulfillment()).toBe('processing'); // this supplier order shipped, but order-level status untouched
  });

  it('advances the order to shipped once every supplier order has shipped', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: true, allShipped: true });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK1',
    });

    expect(result).toBe(true);
    expect(getFulfillment()).toBe('shipped');
  });

  it('is idempotent — a no-op true when the order already advanced to shipped', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: true, allShipped: true });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'shipped');

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK1',
    });

    expect(result).toBe(true);
    expect(getFulfillment()).toBe('shipped'); // still shipped, no re-application
  });

  it('returns true without advancing when the order/payment status cannot be read', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: true, allShipped: true });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment(null, null);

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK1',
    });

    expect(result).toBe(true);
    expect(getFulfillment()).toBeNull();
  });
});
