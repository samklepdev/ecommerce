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

    await new NotifyUnderpaidOnce(store, notifier).execute({ orderId: 'order-1', seenSats: 40_000 });

    expect(notified).toEqual(['order-1']);
  });

  it('notifies once, not on every watcher pass', async () => {
    // The whole reason this use case exists. The watcher re-polls every 45
    // seconds and would otherwise mail the customer each time.
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await notify.execute({ orderId: 'order-1', seenSats: 40_000 });
    await notify.execute({ orderId: 'order-1', seenSats: 40_000 });
    await notify.execute({ orderId: 'order-1', seenSats: 40_000 });

    expect(notified).toEqual(['order-1']);
  });

  it('retries on the next pass when notifying fails', async () => {
    // Marked done only after the notification is away, so a Redis blip costs a
    // cycle rather than the email.
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier(1);
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await expect(notify.execute({ orderId: 'order-1', seenSats: 40_000 })).rejects.toThrow(/redis/i);
    expect(notified).toEqual([]);

    await notify.execute({ orderId: 'order-1', seenSats: 40_000 });
    expect(notified).toEqual(['order-1']);
  });

  it('tells the customer again when the balance changes', async () => {
    // A part-top-up that is still short. Keyed on the order alone, the customer
    // was never told the new figure — the page updated but the only email in
    // their inbox quoted an amount that was no longer owed.
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await notify.execute({ orderId: 'order-1', seenSats: 40_000 });
    await notify.execute({ orderId: 'order-1', seenSats: 40_000 }); // same pass again
    await notify.execute({ orderId: 'order-1', seenSats: 70_000 }); // paid some more

    expect(notified).toEqual(['order-1', 'order-1']);
  });

  it('keys the record per order', async () => {
    const { store } = makeFakeProcessedEvents();
    const { notifier, notified } = makeFakeNotifier();
    const notify = new NotifyUnderpaidOnce(store, notifier);

    await notify.execute({ orderId: 'order-1', seenSats: 40_000 });
    await notify.execute({ orderId: 'order-2', seenSats: 40_000 });

    expect(notified).toEqual(['order-1', 'order-2']);
  });

  describe('when the observed amount keeps moving', () => {
    /**
     * The de-dupe key embedded the exact `seenSats`, and that figure counts
     * unconfirmed value — which anyone can change, repeatedly, by sending to
     * an address that is public the moment the customer pays, or by chaining
     * RBF replacements that differ by a satoshi and never confirm.
     *
     * Each distinct figure minted a new event id, so each watcher pass sent
     * another "your payment was short" email: up to one every 45 seconds, from
     * the shop's own authenticated sending domain, to an address the attacker
     * chose at checkout.
     *
     * Bucketing keeps what the key was for — a customer who genuinely pays
     * more should be told the new balance — while making the number of
     * distinct keys a function of how much has arrived, not of how many times
     * it wobbled.
     */
    it('does not re-notify for a change too small to matter', async () => {
      const { store } = makeFakeProcessedEvents();
      const { notifier, notified } = makeFakeNotifier();
      const notify = new NotifyUnderpaidOnce(store, notifier);

      await notify.execute({ orderId: 'order-1', seenSats: 40_000 });
      await notify.execute({ orderId: 'order-1', seenSats: 40_001 });
      await notify.execute({ orderId: 'order-1', seenSats: 40_546 });

      expect(notified).toEqual(['order-1']);
    });

    it('survives a long run of one-satoshi wobbles', async () => {
      const { store } = makeFakeProcessedEvents();
      const { notifier, notified } = makeFakeNotifier();
      const notify = new NotifyUnderpaidOnce(store, notifier);

      for (let i = 0; i < 200; i += 1) {
        await notify.execute({ orderId: 'order-1', seenSats: 40_000 + i });
      }

      expect(notified).toEqual(['order-1']);
    });

    it('still tells the customer when they genuinely pay more', async () => {
      // The behaviour the key exists for: a real top-up changes the balance,
      // and the customer needs the new figure.
      const { store } = makeFakeProcessedEvents();
      const { notifier, notified } = makeFakeNotifier();
      const notify = new NotifyUnderpaidOnce(store, notifier);

      await notify.execute({ orderId: 'order-1', seenSats: 40_000 });
      await notify.execute({ orderId: 'order-1', seenSats: 70_000 });

      expect(notified).toEqual(['order-1', 'order-1']);
    });
  });
});
