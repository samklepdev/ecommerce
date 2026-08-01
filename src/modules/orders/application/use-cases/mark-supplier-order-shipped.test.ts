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

/** Records the calls so the "one email per parcel" rule can be asserted. */
function makeFakeNotifier() {
  const notified: string[] = [];
  return { notifier: { async notifyShipped(orderId: string) { notified.push(orderId); } }, notified };
}

describe('MarkSupplierOrderShipped', () => {
  it('returns false without touching the order when the guarded markShipped rejects', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: false, allShipped: false });
    const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'processing');

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders, makeFakeNotifier().notifier).execute({
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

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders, makeFakeNotifier().notifier).execute({
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

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders, makeFakeNotifier().notifier).execute({
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

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders, makeFakeNotifier().notifier).execute({
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

    const result = await new MarkSupplierOrderShipped(supplierOrders, orders, makeFakeNotifier().notifier).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK1',
    });

    expect(result).toBe(true);
    expect(getFulfillment()).toBeNull();
  });
});

describe('MarkSupplierOrderShipped notifications', () => {
  it('emails the customer as soon as one parcel ships, not once the last does', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: true, allShipped: false });
    const { repo: orders } = makeFakeOrderFulfillment('paid', 'processing');
    const { notifier, notified } = makeFakeNotifier();

    await new MarkSupplierOrderShipped(supplierOrders, orders, notifier).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK-1',
    });

    expect(notified).toEqual(['order-1']);
  });

  it('says nothing when the supplier order was not actually marked shipped', async () => {
    const supplierOrders = makeFakeSupplierOrders({ markShippedResult: false, allShipped: false });
    const { repo: orders } = makeFakeOrderFulfillment('paid', 'processing');
    const { notifier, notified } = makeFakeNotifier();

    await new MarkSupplierOrderShipped(supplierOrders, orders, notifier).execute({
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK-1',
    });

    expect(notified).toEqual([]);
  });

  describe('when the order has been cancelled underneath the parcel', () => {
    /**
     * `CancelOrderFulfillment` is offered at any payment status, and
     * `FULFILLMENT_TRANSITIONS.cancelled` is empty — so `cancelled -> shipped`
     * throws.
     *
     * The throw came *after* the supplier row had been flipped and the
     * customer emailed a tracking number, and the action does not catch it:
     * the admin got a 500, the customer got "your order has shipped" for an
     * order the shop had cancelled, and the audit-log write never ran. The
     * state was committed; only the record of it was lost.
     */
    function arrange() {
      const supplierOrders = makeFakeSupplierOrders({ markShippedResult: true, allShipped: true });
      const { repo: orders, getFulfillment } = makeFakeOrderFulfillment('paid', 'cancelled');
      const { notifier, notified } = makeFakeNotifier();
      return { supplierOrders, orders, getFulfillment, notifier, notified };
    }

    const input = {
      supplierOrderId: 'so-1',
      orderId: 'order-1',
      trackingNumber: 'TRACK1',
    };

    it('does not throw', async () => {
      const a = arrange();

      await expect(
        new MarkSupplierOrderShipped(a.supplierOrders, a.orders, a.notifier).execute(input),
      ).resolves.toBe(true);
    });

    it('leaves the order cancelled rather than advancing it', async () => {
      const a = arrange();

      await new MarkSupplierOrderShipped(a.supplierOrders, a.orders, a.notifier).execute(input);

      expect(a.getFulfillment()).toBe('cancelled');
    });

    it('still records the parcel, because it is genuinely moving', async () => {
      // The supplier order really did ship. Refusing to record that would put
      // a different lie in the durable record.
      const a = arrange();

      const result = await new MarkSupplierOrderShipped(
        a.supplierOrders,
        a.orders,
        a.notifier,
      ).execute(input);

      expect(result).toBe(true);
    });
  });
});
