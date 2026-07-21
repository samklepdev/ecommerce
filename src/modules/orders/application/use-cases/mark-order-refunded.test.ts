import { describe, expect, it } from 'vitest';

import { MarkOrderRefunded } from './mark-order-refunded';
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
  };
  return { repo, getStatus: () => status };
}

describe('MarkOrderRefunded', () => {
  it('transitions a paid order to refunded', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');

    const result = await new MarkOrderRefunded(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(true);
    expect(getStatus()).toBe('refunded');
  });

  it('returns not_found for a nonexistent order', async () => {
    const { repo } = makeFakeOrders(null);

    const result = await new MarkOrderRefunded(repo).execute({ orderId: 'missing' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('returns illegal_transition for an order that is not paid', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');

    const result = await new MarkOrderRefunded(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('awaiting_confirmation'); // unchanged
  });

  it('returns illegal_transition for an order that is already refunded (no double-refund)', async () => {
    const { repo, getStatus } = makeFakeOrders('refunded');

    const result = await new MarkOrderRefunded(repo).execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('illegal_transition');
    expect(getStatus()).toBe('refunded');
  });
});
