import { describe, expect, it } from 'vitest';

import {
  ExpireStaleCheckouts,
  type ExpiringPaymentIntentStore,
  type StaleCheckoutOrderRepository,
} from './expire-stale-checkouts';

function makeFakeOrders(expiredIds: string[], failingId?: string, losingIds: string[] = []) {
  const expired: string[] = [];
  const repo: StaleCheckoutOrderRepository = {
    async findExpiredAwaitingOrderIds() {
      return expiredIds;
    },
    async tryExpire(orderId) {
      if (orderId === failingId) throw new Error('boom');
      // Lost the race: another actor moved this order on between the query
      // and the write, so this pass expired nothing.
      if (losingIds.includes(orderId)) return false;
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

  /**
   * `tryExpire` is compare-and-set and reports whether it applied. Ignoring
   * that answer meant a pass that lost the race still marked the intent
   * `expired` — and `listWatchable` only returns `awaiting` intents, so the
   * order stayed open, still inviting a top-up, against an address nobody was
   * polling any more. `SweepLatePayments` doesn't cover it either: that keys
   * off the *order's* terminal status, and this order isn't terminal.
   */
  it('leaves the intent alone when it did not expire the order', async () => {
    const { repo, expired: expiredOrders } = makeFakeOrders(['order-1'], undefined, ['order-1']);
    const { store, expired: expiredIntents } = makeFakeIntents();

    await new ExpireStaleCheckouts(repo, store).execute();

    expect(expiredOrders).toEqual([]);
    expect(expiredIntents).toEqual([]);
  });

  it('still expires the intents of orders it did win', async () => {
    const { repo } = makeFakeOrders(['order-1', 'order-2'], undefined, ['order-1']);
    const { store, expired: expiredIntents } = makeFakeIntents();

    await new ExpireStaleCheckouts(repo, store).execute();

    expect(expiredIntents).toEqual(['order-2']);
  });

  it('does not expire the intent when expiring the order threw', async () => {
    // A throw is not "someone else won" — we simply don't know, and the next
    // pass will find the order again. Marking the intent expired on the way
    // past would stop that pass from being able to see a payment.
    const { repo } = makeFakeOrders(['order-1'], 'order-1');
    const { store, expired: expiredIntents } = makeFakeIntents();

    await new ExpireStaleCheckouts(repo, store).execute();

    expect(expiredIntents).toEqual([]);
  });
});
