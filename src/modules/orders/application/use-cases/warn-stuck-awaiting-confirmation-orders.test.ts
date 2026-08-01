import { describe, expect, it } from 'vitest';

import { WarnStuckAwaitingConfirmationOrders } from './warn-stuck-awaiting-confirmation-orders';
import type { StuckAwaitingConfirmationOrderRepository } from './fail-stuck-awaiting-confirmation-orders';

const HOUR_MS = 3_600_000;

function makeFakeOrders(ids: string[]) {
  const cutoffs: Date[] = [];
  const repo: StuckAwaitingConfirmationOrderRepository = {
    async findStuckAwaitingConfirmationOrderIds(cutoff) {
      cutoffs.push(cutoff);
      return ids;
    },
    async tryFailStuckAwaitingConfirmation() {
      throw new Error('warning must never fail an order');
    },
  };
  return { repo, cutoffs };
}

function makeFakeProcessedEvents() {
  const seenIds = new Set<string>();
  return {
    store: {
      async seen(id: string) {
        return seenIds.has(id);
      },
      async markSeen(id: string) {
        seenIds.add(id);
      },
    },
    seenIds,
  };
}

function makeFakeNotifier(failTimes = 0) {
  const notified: string[] = [];
  let failures = failTimes;
  return {
    notifier: {
      async notifyUnderpaid(orderId: string) {
        if (failures > 0) {
          failures -= 1;
          throw new Error('mail provider down');
        }
        notified.push(orderId);
      },
    },
    notified,
  };
}

describe('WarnStuckAwaitingConfirmationOrders', () => {
  /**
   * The window this warns about is the sharpest clock in the system. When it
   * runs out `FailStuckAwaitingConfirmationOrders` moves the order to `failed`,
   * which is terminal, and with no refund mechanism a part-paying customer's
   * money is simply gone. Until now nothing told them it was coming: the
   * balance email said the amount owed "won't move while you finish paying"
   * and named no limit, and the deadline appeared on no screen at all.
   */
  it('warns an order approaching its top-up deadline', async () => {
    const { repo } = makeFakeOrders(['order-1']);
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();

    await new WarnStuckAwaitingConfirmationOrders(repo, store, notifier, 48, 12).execute();

    expect(notified).toEqual(['order-1']);
  });

  it('asks for orders past the warning point, not past the deadline', async () => {
    // 48h window, warn 12h before -> everything older than 36h.
    const { repo, cutoffs } = makeFakeOrders([]);
    const { store } = makeFakeProcessedEvents();
    const { notifier } = makeFakeNotifier();
    const before = Date.now();

    await new WarnStuckAwaitingConfirmationOrders(repo, store, notifier, 48, 12).execute();

    expect(cutoffs).toHaveLength(1);
    const cutoff = cutoffs[0]!.getTime();
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 36 * HOUR_MS + 5_000);
    expect(cutoff).toBeGreaterThanOrEqual(before - 36 * HOUR_MS - 5_000);
  });

  it('warns once, not on every worker tick', async () => {
    // This runs on the same clock as the watcher. Without the guard a customer
    // would be mailed the same warning every 45 seconds for twelve hours.
    const { repo } = makeFakeOrders(['order-1']);
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();
    const warn = new WarnStuckAwaitingConfirmationOrders(repo, store, notifier, 48, 12);

    await warn.execute();
    await warn.execute();
    await warn.execute();

    expect(notified).toEqual(['order-1']);
  });

  it('retries on the next pass when the mail fails', async () => {
    // Marked seen only after the notification is away, so a provider blip
    // costs a cycle rather than the only warning the customer gets.
    const { repo } = makeFakeOrders(['order-1']);
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier(1);
    const warn = new WarnStuckAwaitingConfirmationOrders(repo, store, notifier, 48, 12);

    await warn.execute();
    expect(notified).toEqual([]);

    await warn.execute();
    expect(notified).toEqual(['order-1']);
  });

  it('keeps going when one order cannot be mailed', async () => {
    const { repo } = makeFakeOrders(['order-1', 'order-2']);
    const { store } = makeFakeProcessedEvents();
    const notified: string[] = [];
    const notifier = {
      async notifyUnderpaid(orderId: string) {
        if (orderId === 'order-1') throw new Error('mail provider down');
        notified.push(orderId);
      },
    };

    await new WarnStuckAwaitingConfirmationOrders(repo, store, notifier, 48, 12).execute();

    expect(notified).toEqual(['order-2']);
  });

  it('does nothing when the warning point is not inside the window', async () => {
    // A misconfiguration, not a reason to mail everybody the instant their
    // payment is seen: warning 48h before a 48h deadline means warning at zero.
    const { repo, cutoffs } = makeFakeOrders(['order-1']);
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();

    await new WarnStuckAwaitingConfirmationOrders(repo, store, notifier, 48, 48).execute();

    expect(cutoffs).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('never fails an order itself', async () => {
    // Warning and failing are separate passes on purpose. The fake throws if
    // this one so much as reaches for the failing method.
    const { repo } = makeFakeOrders(['order-1']);
    const { store } = makeFakeProcessedEvents();
    const { notifier } = makeFakeNotifier();

    await expect(
      new WarnStuckAwaitingConfirmationOrders(repo, store, notifier, 48, 12).execute(),
    ).resolves.toBeUndefined();
  });
});
