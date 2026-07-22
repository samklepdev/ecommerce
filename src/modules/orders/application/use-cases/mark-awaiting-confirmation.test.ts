import { describe, expect, it } from 'vitest';

import { MarkAwaitingConfirmation } from './mark-awaiting-confirmation';
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

describe('MarkAwaitingConfirmation', () => {
  it('moves awaiting_payment to awaiting_confirmation', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('awaiting_confirmation');
  });

  it('is a no-op when already awaiting_confirmation', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('awaiting_confirmation');
  });

  it('is a no-op when the order has already progressed past this point (e.g. paid)', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('paid'); // unchanged
  });

  it('is a no-op when the order is in a state that never awaits payment (e.g. pending)', async () => {
    const { repo, getStatus } = makeFakeOrders('pending');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('pending'); // unchanged — only awaiting_payment advances
  });

  it('is a no-op when the order does not exist', async () => {
    const { repo, getStatus } = makeFakeOrders(null);
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'missing' });
    expect(getStatus()).toBeNull();
  });
});
