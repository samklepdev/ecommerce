import { describe, expect, it } from 'vitest';

import { NotifyUnderpaidOnce } from './notify-underpaid-once';
import type { ProcessedEventStore } from './confirm-payment';
import type { UnderpaymentNotifier } from '@/modules/orders/application/ports/underpayment-notifier';

function makeFakeProcessedEvents() {
  const seenIds = new Set<string>();
  const store: ProcessedEventStore = {
    async seen(eventId) {
      return seenIds.has(eventId);
    },
    async markSeen(eventId) {
      seenIds.add(eventId);
    },
  };
  return { store, seenIds };
}

function makeFakeNotifier(failFirstCalls = 0) {
  const notified: string[] = [];
  let failuresLeft = failFirstCalls;
  const notifier: UnderpaymentNotifier = {
    async notifyUnderpaid(orderId) {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('redis unavailable');
      }
      notified.push(orderId);
    },
  };
  return { notifier, notified };
}

describe('NotifyUnderpaidOnce', () => {
  it('notifies the customer that their payment was short', async () => {
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();

    await new NotifyUnderpaidOnce(store, notifier).execute({ orderId: 'order-1', confirmedSats: 40_000 });

    expect(notified).toEqual(['order-1']);
  });

  it('notifies once, not on every watcher pass', async () => {
    // The whole reason this use case exists. The watcher re-polls every 45
    // seconds and would otherwise mail the customer each time.
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await notify.execute({ orderId: 'order-1', confirmedSats: 40_000 });
    await notify.execute({ orderId: 'order-1', confirmedSats: 40_000 });
    await notify.execute({ orderId: 'order-1', confirmedSats: 40_000 });

    expect(notified).toEqual(['order-1']);
  });

  it('retries on the next pass when notifying fails', async () => {
    // Marked done only after the notification is away, so a Redis blip costs a
    // cycle rather than the email.
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier(1);
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await expect(notify.execute({ orderId: 'order-1', confirmedSats: 40_000 })).rejects.toThrow(/redis/i);
    expect(notified).toEqual([]);

    await notify.execute({ orderId: 'order-1', confirmedSats: 40_000 });
    expect(notified).toEqual(['order-1']);
  });

  it('tells the customer again when the balance changes', async () => {
    // A part-top-up that is still short. Keyed on the order alone, the customer
    // was never told the new figure — the page updated but the only email in
    // their inbox quoted an amount that was no longer owed.
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await notify.execute({ orderId: 'order-1', confirmedSats: 40_000 });
    await notify.execute({ orderId: 'order-1', confirmedSats: 40_000 }); // same pass again
    await notify.execute({ orderId: 'order-1', confirmedSats: 70_000 }); // paid some more

    expect(notified).toEqual(['order-1', 'order-1']);
  });

  it('keys the record per order', async () => {
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await notify.execute({ orderId: 'order-1', confirmedSats: 40_000 });
    await notify.execute({ orderId: 'order-2', confirmedSats: 40_000 });

    expect(notified).toEqual(['order-1', 'order-2']);
  });
});
