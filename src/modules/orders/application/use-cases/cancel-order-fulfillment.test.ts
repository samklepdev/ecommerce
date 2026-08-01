import { describe, expect, it } from 'vitest';

import { CancelOrderFulfillment } from './cancel-order-fulfillment';
import { isErr, isOk } from '@/shared/domain/result';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

function makeFakeOrders(paymentStatus: PaymentStatus | null, fulfillmentStatus: FulfillmentStatus | null) {
  let current = fulfillmentStatus;
  const repo: OrderFulfillmentRepository = {
    async getPaymentStatus() {
      return paymentStatus;
    },
    async getFulfillmentStatus() {
      return current;
    },
    async setFulfillmentStatus(_orderId, status) {
      current = status;
    },
  };
  return { repo, get: () => current };
}

describe('CancelOrderFulfillment', () => {
  it('cancels an order that was paid but could never be fulfilled', async () => {
    // The case this exists for: money arrived, the goods can't be obtained, and
    // before this there was no action anywhere that could close the order.
    const { repo, get } = makeFakeOrders('paid', 'unfulfilled');

    const result = await new CancelOrderFulfillment(repo).execute({ orderId: 'order-1' });

    expect(isOk(result)).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('cancels one that had started processing', async () => {
    const { repo, get } = makeFakeOrders('paid', 'processing');

    expect(isOk(await new CancelOrderFulfillment(repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('cancels a shipped order, for a parcel lost in transit', async () => {
    const { repo, get } = makeFakeOrders('paid', 'shipped');

    expect(isOk(await new CancelOrderFulfillment(repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('refuses once the order has been delivered', async () => {
    // Delivered is the truth about a parcel that arrived. Cancelling it would
    // rewrite history rather than record a decision.
    const { repo, get } = makeFakeOrders('paid', 'delivered');

    const result = await new CancelOrderFulfillment(repo).execute({ orderId: 'order-1' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('illegal_transition');
    expect(get()).toBe('delivered');
  });

  it('is a no-op rather than an error when already cancelled', async () => {
    // Two admins on the same page shouldn't produce a scary message for an
    // outcome that is exactly what they both wanted.
    const { repo, get } = makeFakeOrders('paid', 'cancelled');

    expect(isOk(await new CancelOrderFulfillment(repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });

  it('reports an order that does not exist', async () => {
    const { repo } = makeFakeOrders(null, null);

    const result = await new CancelOrderFulfillment(repo).execute({ orderId: 'missing' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('not_found');
  });

  it('works for an unpaid order too, so a stuck one is never trapped', async () => {
    // `assertFulfillmentTransition` deliberately permits `cancelled` regardless
    // of payment status — cancelling is the one move that must always be
    // available, or an order in an unexpected state has no way out.
    const { repo, get } = makeFakeOrders('expired', 'unfulfilled');

    expect(isOk(await new CancelOrderFulfillment(repo).execute({ orderId: 'order-1' }))).toBe(true);
    expect(get()).toBe('cancelled');
  });
});
