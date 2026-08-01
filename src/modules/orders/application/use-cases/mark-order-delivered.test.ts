import { describe, expect, it } from 'vitest';

import { MarkOrderDelivered } from './mark-order-delivered';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

function makeFakeOrders(paymentStatus: PaymentStatus | null, fulfillmentStatus: FulfillmentStatus | null) {
  let status = fulfillmentStatus;
  const repo: OrderFulfillmentRepository = {
    async getPaymentStatus() {
      return paymentStatus;
    },
    async getFulfillmentStatus() {
      return status;
    },
    async setFulfillmentStatus(_orderId, next, expectedFrom) {
      // Mirrors the repository's compare-and-set, so a test cannot pass
      // against a fake more permissive than the database.
      if (status !== expectedFrom) return false;
      status = next;
      return true;
    },
  };
  return { repo, getStatus: () => status };
}

describe('MarkOrderDelivered', () => {
  it('transitions a shipped, paid order to delivered', async () => {
    const { repo, getStatus } = makeFakeOrders('paid', 'shipped');

    const result = await new MarkOrderDelivered(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(true);
    expect(getStatus()).toBe('delivered');
  });

  it('returns not_found for a nonexistent order', async () => {
    const { repo } = makeFakeOrders(null, null);

    const result = await new MarkOrderDelivered(repo).execute({ orderId: 'missing' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('returns illegal_transition for an order that has not shipped yet', async () => {
    const { repo, getStatus } = makeFakeOrders('paid', 'unfulfilled');

    const result = await new MarkOrderDelivered(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('unfulfilled'); // unchanged
  });

  it('returns illegal_transition for an order that is already delivered (no double-deliver)', async () => {
    const { repo, getStatus } = makeFakeOrders('paid', 'delivered');

    const result = await new MarkOrderDelivered(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('delivered');
  });
});
