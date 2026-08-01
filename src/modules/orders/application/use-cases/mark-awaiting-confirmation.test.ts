import { describe, expect, it } from 'vitest';

import {
  MarkAwaitingConfirmation,
  type MarkAwaitingConfirmationOrderRepository,
} from './mark-awaiting-confirmation';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

function makeFakeOrders(initialStatus: PaymentStatus | null) {
  let status = initialStatus;
  let markAwaitingConfirmationCalls = 0;
  const repo: MarkAwaitingConfirmationOrderRepository = {
    async getPaymentStatus() {
      return status;
    },
    async markAwaitingConfirmation() {
      markAwaitingConfirmationCalls++;
      status = 'awaiting_confirmation';
    },
  };
  return { repo, getStatus: () => status, getMarkAwaitingConfirmationCalls: () => markAwaitingConfirmationCalls };
}

describe('MarkAwaitingConfirmation', () => {
  it('moves awaiting_payment to awaiting_confirmation', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('awaiting_confirmation');
  });

  it('calls markAwaitingConfirmation exactly once on the actual transition, so awaitingConfirmationSince is stamped only at first entry', async () => {
    const { repo, getMarkAwaitingConfirmationCalls } = makeFakeOrders('awaiting_payment');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getMarkAwaitingConfirmationCalls()).toBe(1);
  });

  it('is a no-op when already awaiting_confirmation, and never re-stamps the timestamp', async () => {
    const { repo, getStatus, getMarkAwaitingConfirmationCalls } = makeFakeOrders('awaiting_confirmation');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('awaiting_confirmation');
    expect(getMarkAwaitingConfirmationCalls()).toBe(0);
  });

  it('is a no-op when the order has already progressed past this point (e.g. paid)', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('paid'); // unchanged
  });

  it('advances a pending order whose checkout crashed after deriving the address', async () => {
    // `StartCheckout` derives the address and then records `awaiting_payment`;
    // a crash between the two leaves the order `pending` with a live intent,
    // and the BIP21 URI already in the customer's hands. Money arriving
    // against it has to be recordable, not ignored.
    const { repo, getStatus } = makeFakeOrders('pending');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('awaiting_confirmation');
  });

  it('is a no-op for a state that is genuinely past this point', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'order-1' });
    expect(getStatus()).toBe('paid');
  });

  it('is a no-op when the order does not exist', async () => {
    const { repo, getStatus } = makeFakeOrders(null);
    await new MarkAwaitingConfirmation(repo).execute({ orderId: 'missing' });
    expect(getStatus()).toBeNull();
  });
});
