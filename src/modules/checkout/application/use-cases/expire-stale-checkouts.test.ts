import { describe, expect, it } from 'vitest';

import {
  ExpireStaleCheckouts,
  type ExpiringPaymentIntentStore,
  type StaleCheckoutOrderRepository,
} from './expire-stale-checkouts';

function makeFakeOrders(expiredIds: string[], failingId?: string) {
  const expired: string[] = [];
  const repo: StaleCheckoutOrderRepository = {
    async findExpiredAwaitingOrderIds() {
      return expiredIds;
    },
    async tryExpire(orderId) {
      if (orderId === failingId) throw new Error('boom');
      expired.push(orderId);
      return true;
    },
  };
  return { repo, expired };
}

function makeFakeIntents(failingId?: string) {
  const expired: string[] = [];
  const store: ExpiringPaymentIntentStore = {
    async markExpired(orderId) {
      if (orderId === failingId) throw new Error('intent boom');
      expired.push(orderId);
    },
  };
  return { store, expired };
}

describe('ExpireStaleCheckouts', () => {
  // The order and its payment intent are two records; expiring only the
  // order left the intent reading `awaiting` forever, and a retried checkout
  // would have been handed back that stale rate-lock.
  it('expires the payment intent alongside the order', async () => {
    const { repo, expired: expiredOrders } = makeFakeOrders(['order-1', 'order-2']);
    const { store, expired: expiredIntents } = makeFakeIntents();

    await new ExpireStaleCheckouts(repo, store).execute();

    expect(expiredOrders).toEqual(['order-1', 'order-2']);
    expect(expiredIntents).toEqual(['order-1', 'order-2']);
  });

  // The order is the record that matters; a failure updating the intent's
  // bookkeeping must not leave the order stuck awaiting payment forever.
  it('still expires the order when marking the intent fails', async () => {
    const { repo, expired: expiredOrders } = makeFakeOrders(['order-1', 'order-2']);
    const { store } = makeFakeIntents('order-1');

    await new ExpireStaleCheckouts(repo, store).execute();

    expect(expiredOrders).toEqual(['order-1', 'order-2']);
  });

  it('expires every order returned as stale', async () => {
    const { repo, expired } = makeFakeOrders(['order-1', 'order-2']);
    await new ExpireStaleCheckouts(repo, makeFakeIntents().store).execute();
    expect(expired).toEqual(['order-1', 'order-2']);
  });

  it('is a no-op when nothing is stale', async () => {
    const { repo, expired } = makeFakeOrders([]);
    await new ExpireStaleCheckouts(repo, makeFakeIntents().store).execute();
    expect(expired).toEqual([]);
  });

  it('continues expiring remaining orders even if one fails', async () => {
    const { repo, expired } = makeFakeOrders(['order-1', 'order-2', 'order-3'], 'order-2');
    await new ExpireStaleCheckouts(repo, makeFakeIntents().store).execute();
    expect(expired).toEqual(['order-1', 'order-3']);
  });
});
