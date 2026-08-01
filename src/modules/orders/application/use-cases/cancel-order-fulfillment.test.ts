import { describe, expect, it } from 'vitest';

import { CancelOrderFulfillment } from './cancel-order-fulfillment';
import { isErr, isOk } from '@/shared/domain/result';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';
import type {
  SupplierOrderRepository,
  SupplierOrderSummary,
} from '@/modules/orders/application/ports/supplier-order-repository';

function makeFakeOrders(paymentStatus: PaymentStatus | null, fulfillmentStatus: FulfillmentStatus | null) {
  let current = fulfillmentStatus;
  const repo: OrderFulfillmentRepository = {
    async getPaymentStatus() {
      return paymentStatus;
    },
    async getFulfillmentStatus() {
      return current;
    },
    async setFulfillmentStatus(_orderId, status, expectedFrom) {
      // Mirrors the repository's compare-and-set, so a test cannot pass
      // against a fake more permissive than the database.
      if (current !== expectedFrom) return false;
      current = status;
      return true;
    },
  };
  return { repo, get: () => current };
}

/** Supplier orders for the order under test, with the same guard the real
 * repository applies: only outstanding ones can be cancelled. */
function makeFakeSupplierOrders(statuses: Record<string, string> = {}) {
  const cancelled: string[] = [];
  const repo: Partial<SupplierOrderRepository> = {
    async listByOrderId() {
      return Object.entries(statuses).map(([id, status]) => ({ id, status }) as SupplierOrderSummary);
    },
    async cancel(supplierOrderId) {
      const status = statuses[supplierOrderId];
      if (status !== 'needs_ordering' && status !== 'ordered') return false;
      statuses[supplierOrderId] = 'cancelled';
      cancelled.push(supplierOrderId);
      return true;
    },
  };
  return { repo: repo as SupplierOrderRepository, cancelled };
}

describe('CancelOrderFulfillment', () => {
  it('cancels an order that was paid but could never be fulfilled', async () => {
    // The case this exists for: money arrived, the goods can't be obtained, and
    // before this there was no action anywhere that could close the order.
    const { repo, get } = makeFakeOrders('paid', 'unfulfilled');

    const result = await new CancelOrderFulfillment(repo, makeFakeSupplierOrders().repo).execute({ orderId: 'order-1' });

    expect(isOk(result)).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('cancels one that had started processing', async () => {
    const { repo, get } = makeFakeOrders('paid', 'processing');

    expect(isOk(await new CancelOrderFulfillment(repo, makeFakeSupplierOrders().repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('cancels a shipped order, for a parcel lost in transit', async () => {
    const { repo, get } = makeFakeOrders('paid', 'shipped');

    expect(isOk(await new CancelOrderFulfillment(repo, makeFakeSupplierOrders().repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('refuses once the order has been delivered', async () => {
    // Delivered is the truth about a parcel that arrived. Cancelling it would
    // rewrite history rather than record a decision.
    const { repo, get } = makeFakeOrders('paid', 'delivered');

    const result = await new CancelOrderFulfillment(repo, makeFakeSupplierOrders().repo).execute({ orderId: 'order-1' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('illegal_transition');
    expect(get()).toBe('delivered');
  });

  it('is a no-op rather than an error when already cancelled', async () => {
    // Two admins on the same page shouldn't produce a scary message for an
    // outcome that is exactly what they both wanted.
    const { repo, get } = makeFakeOrders('paid', 'cancelled');

    expect(isOk(await new CancelOrderFulfillment(repo, makeFakeSupplierOrders().repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('reports an order that does not exist', async () => {
    const { repo } = makeFakeOrders(null, null);

    const result = await new CancelOrderFulfillment(repo, makeFakeSupplierOrders().repo).execute({ orderId: 'missing' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('not_found');
  });

  it('works for an unpaid order too, so a stuck one is never trapped', async () => {
    // `assertFulfillmentTransition` deliberately permits `cancelled` regardless
    // of payment status — cancelling is the one move that must always be
    // available, or an order in an unexpected state has no way out.
    const { repo, get } = makeFakeOrders('expired', 'unfulfilled');

    expect(isOk(await new CancelOrderFulfillment(repo, makeFakeSupplierOrders().repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });

  describe('the supplier orders underneath it', () => {
    /**
     * Cancelling recorded the shop's decision on the order row and nothing
     * else. `listNeedingAction` filters purely on the supplier order's own
     * status with no join to its parent, so the cancelled order's supplier
     * orders stayed in `/admin/fulfillment` with a working "Mark ordered"
     * button and a shipping address, and nothing on the card said the order
     * was dead. Whoever worked that queue bought the goods.
     */
    it('cancels the ones still outstanding', async () => {
      const { repo } = makeFakeOrders('paid', 'processing');
      const { repo: supplierOrders, cancelled } = makeFakeSupplierOrders({
        'so-1': 'needs_ordering',
        'so-2': 'ordered',
      });

      await new CancelOrderFulfillment(repo, supplierOrders).execute({ orderId: 'order-1' });

      expect(cancelled.sort()).toEqual(['so-1', 'so-2']);
    });

    it('leaves a parcel that already shipped alone', async () => {
      // The goods are with a courier. Recording them as cancelled would be a
      // different lie, and the repository's own guard refuses it anyway.
      const { repo } = makeFakeOrders('paid', 'shipped');
      const { repo: supplierOrders, cancelled } = makeFakeSupplierOrders({ 'so-1': 'shipped' });

      await new CancelOrderFulfillment(repo, supplierOrders).execute({ orderId: 'order-1' });

      expect(cancelled).toEqual([]);
    });

    it('still cancels the order when it has no supplier orders at all', async () => {
      const { repo, get } = makeFakeOrders('paid', 'unfulfilled');
      const { repo: supplierOrders } = makeFakeSupplierOrders();

      const result = await new CancelOrderFulfillment(repo, supplierOrders).execute({
        orderId: 'order-1',
      });

      expect(isOk(result)).toBe(true);
      expect(get()).toBe('cancelled');
    });

    it('does not touch supplier orders when the cancellation itself is refused', async () => {
      const { repo } = makeFakeOrders('paid', 'delivered');
      const { repo: supplierOrders, cancelled } = makeFakeSupplierOrders({ 'so-1': 'ordered' });

      const result = await new CancelOrderFulfillment(repo, supplierOrders).execute({
        orderId: 'order-1',
      });

      expect(isErr(result)).toBe(true);
      expect(cancelled).toEqual([]);
    });
  });
});
