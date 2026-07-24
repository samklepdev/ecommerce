import { describe, expect, it } from 'vitest';

import { FailOrder } from './fail-order';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

function makeFakeOrders(initialStatus: PaymentStatus | null) {
  let status = initialStatus;
  const repo: ConfirmPaymentOrderRepository = {
    async getPaymentStatus() {
      return status;
    },
    async setPaymentStatus(_orderId, next) {
      status = next;
    },
    async recordPaymentRecovery() {},
  };
  return { repo, getStatus: () => status };
}

describe('FailOrder', () => {
  it('transitions an awaiting_confirmation order to failed', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(true);
    expect(getStatus()).toBe('failed');
  });

  it('returns not_found for a nonexistent order', async () => {
    const { repo } = makeFakeOrders(null);

    const result = await new FailOrder(repo).execute({ orderId: 'missing' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('returns illegal_transition for an order that is already paid', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('paid'); // unchanged
  });

  it('returns illegal_transition for an order that is already failed (no double-fail)', async () => {
    const { repo, getStatus } = makeFakeOrders('failed');

    const result = await new FailOrder(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('failed');
  });
});
