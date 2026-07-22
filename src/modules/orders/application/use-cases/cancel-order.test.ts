import { describe, expect, it } from 'vitest';

import { CancelOrder } from './cancel-order';
import type { CancelOrderRepository } from '@/modules/orders/application/ports/cancel-order-repository';
import type { CancelPaymentIntentStore } from '@/modules/orders/application/ports/cancel-payment-intent-store';

function makeFakeRepo(result: boolean) {
  const calls: { orderId: string; ownerUserId: string | null }[] = [];
  const repo: CancelOrderRepository = {
    async cancelOrder(orderId, ownerUserId) {
      calls.push({ orderId, ownerUserId });
      return result;
    },
  };
  return { repo, calls };
}

function makeFakePaymentIntentStore() {
  const markedCancelledOrderIds: string[] = [];
  const store: CancelPaymentIntentStore = {
    async markCancelled(orderId) {
      markedCancelledOrderIds.push(orderId);
    },
  };
  return { store, markedCancelledOrderIds };
}

describe('CancelOrder', () => {
  it('succeeds when the repository reports the cancellation went through', async () => {
    const { repo, calls } = makeFakeRepo(true);
    const { store } = makeFakePaymentIntentStore();
    const result = await new CancelOrder(repo, store).execute({ orderId: 'order-1', userId: 'user-1' });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ orderId: 'order-1', ownerUserId: 'user-1' }]);
  });

  it('passes through a null userId for the guest/id-only path', async () => {
    const { repo, calls } = makeFakeRepo(true);
    const { store } = makeFakePaymentIntentStore();
    await new CancelOrder(repo, store).execute({ orderId: 'order-1', userId: null });
    expect(calls).toEqual([{ orderId: 'order-1', ownerUserId: null }]);
  });

  it('returns not_cancellable when the repository reports it did not cancel', async () => {
    const { repo } = makeFakeRepo(false);
    const { store } = makeFakePaymentIntentStore();
    const result = await new CancelOrder(repo, store).execute({ orderId: 'order-1', userId: 'user-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_cancellable');
  });

  it('marks the payment intent cancelled once the order is successfully cancelled', async () => {
    const { repo } = makeFakeRepo(true);
    const { store, markedCancelledOrderIds } = makeFakePaymentIntentStore();

    await new CancelOrder(repo, store).execute({ orderId: 'order-1', userId: 'user-1' });

    expect(markedCancelledOrderIds).toEqual(['order-1']);
  });

  it('does not mark the payment intent cancelled when the order was not cancellable', async () => {
    const { repo } = makeFakeRepo(false);
    const { store, markedCancelledOrderIds } = makeFakePaymentIntentStore();

    await new CancelOrder(repo, store).execute({ orderId: 'order-1', userId: 'user-1' });

    expect(markedCancelledOrderIds).toHaveLength(0);
  });
});
