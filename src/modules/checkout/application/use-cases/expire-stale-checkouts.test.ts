import { describe, expect, it } from 'vitest';

import {
  ExpireStaleCheckouts,
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

describe('ExpireStaleCheckouts', () => {
  it('expires every order returned as stale', async () => {
    const { repo, expired } = makeFakeOrders(['order-1', 'order-2']);
    await new ExpireStaleCheckouts(repo).execute();
    expect(expired).toEqual(['order-1', 'order-2']);
  });

  it('is a no-op when nothing is stale', async () => {
    const { repo, expired } = makeFakeOrders([]);
    await new ExpireStaleCheckouts(repo).execute();
    expect(expired).toEqual([]);
  });

  it('continues expiring remaining orders even if one fails', async () => {
    const { repo, expired } = makeFakeOrders(['order-1', 'order-2', 'order-3'], 'order-2');
    await new ExpireStaleCheckouts(repo).execute();
    expect(expired).toEqual(['order-1', 'order-3']);
  });
});
