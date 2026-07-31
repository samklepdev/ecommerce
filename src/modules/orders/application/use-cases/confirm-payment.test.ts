import { describe, expect, it, vi } from 'vitest';

import { ConfirmPayment, type FulfillmentQueue, type ProcessedEventStore } from './confirm-payment';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import type { PaymentConfirmationNotifier } from '@/modules/orders/application/ports/payment-confirmation-notifier';
import { logger } from '@/shared/infrastructure/logger';

function makeFakeOrders(initialStatus: PaymentStatus | null) {
  let status = initialStatus;
  const recoveries: { orderId: string; from: 'expired' | 'cancelled' }[] = [];
  const repo: ConfirmPaymentOrderRepository = {
    async getPaymentStatus() {
      return status;
    },
    async setPaymentStatus(_orderId, next) {
      status = next;
    },
    async recordPaymentRecovery(orderId, from) {
      recoveries.push({ orderId, from });
    },
  };
  return { repo, getStatus: () => status, recoveries };
}

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
  return store;
}

function makeFakeFulfillment(failFirstCalls = 0) {
  const enqueued: string[] = [];
  let failuresLeft = failFirstCalls;
  const queue: FulfillmentQueue = {
    async enqueueOrderPaid(orderId) {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('redis unavailable');
      }
      enqueued.push(orderId);
    },
  };
  return { queue, enqueued };
}

function makeFakeNotifier(shouldThrow = false) {
  const notified: string[] = [];
  const notifier: PaymentConfirmationNotifier = {
    async notifyPaymentConfirmed(orderId) {
      if (shouldThrow) throw new Error('email provider down');
      notified.push(orderId);
    },
  };
  return { notifier, notified };
}

describe('ConfirmPayment', () => {
  it('moves a legally-transitionable order to paid and enqueues fulfillment', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier, notified } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-1', confirmedSats: 100000 });

    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual(['order-1']);
    expect(notified).toEqual(['order-1']);
    expect(await processedEvents.seen('evt-1')).toBe(true);
  });

  it('de-dupes by event id — a repeated event does nothing on the second call', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier, notified } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-1', confirmedSats: 100000 });
    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-1', confirmedSats: 100000 });

    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual(['order-1']); // only enqueued once
    expect(notified).toEqual(['order-1']); // only notified once
  });

  /**
   * This used to assert the opposite — that an unseen event for an already-paid
   * order did nothing at all. That was the bug: "already paid" and "already
   * finished" are not the same state, and treating them as one is how
   * fulfillment got dropped. An *unseen* event id is the evidence that a
   * previous attempt didn't complete, so the remaining work is completed
   * rather than skipped.
   *
   * The real no-op is a **seen** event id, covered by the de-dupe test above.
   */
  it('completes the outstanding work when the order is paid but the event is unseen', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier, notified } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-2', confirmedSats: 100000 });

    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual(['order-1']);
    expect(notified).toEqual(['order-1']);
    expect(await processedEvents.seen('evt-2')).toBe(true);
  });

  it('does not re-run the status transition for an order already paid', async () => {
    // `paid -> paid` is not a legal transition, so re-entry must skip the
    // assertion rather than trip over it.
    const { repo, recoveries } = makeFakeOrders('paid');
    const processedEvents = makeFakeProcessedEvents();
    const { queue } = makeFakeFulfillment();
    const { notifier } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await expect(
      confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-8', confirmedSats: 1 }),
    ).resolves.toBeUndefined();
    expect(recoveries).toEqual([]);
  });

  // The bug this guards: the order was committed as `paid` and then the
  // enqueue threw (Redis down is exactly what makes it throw), so the event
  // was never marked seen. The watcher re-polls because `markConfirmed` was
  // never reached either — and the old code saw `status === 'paid'`, marked
  // the event seen, and returned. Sourcing was never enqueued again, so a
  // paid customer had nothing ordered and only an admin noticing recovered it.
  it('recovers fulfillment when a previous attempt paid the order but failed before finishing', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment(1);
    const { notifier } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);
    const event = { orderId: 'order-1', eventId: 'btc-confirmed-order-1', confirmedSats: 100000 };

    // First pass: status commits, enqueue blows up, so nothing is marked done.
    await expect(confirmPayment.execute(event)).rejects.toThrow(/redis/i);
    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual([]);
    expect(await processedEvents.seen(event.eventId)).toBe(false);

    // Second pass, same event id — the watcher's id is stable per order.
    await confirmPayment.execute(event);

    expect(enqueued).toEqual(['order-1']);
    expect(await processedEvents.seen(event.eventId)).toBe(true);
  });

  it('does not mark the event seen when the enqueue fails', async () => {
    // `markSeen` means every side effect completed. If it were set before the
    // enqueue succeeded, the retry above could never happen.
    const { repo } = makeFakeOrders('awaiting_payment');
    const processedEvents = makeFakeProcessedEvents();
    const { queue } = makeFakeFulfillment(99);
    const { notifier } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await expect(
      confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-9', confirmedSats: 1 }),
    ).rejects.toThrow();

    expect(await processedEvents.seen('evt-9')).toBe(false);
  });

  it('does nothing if the order does not exist', async () => {
    const { repo } = makeFakeOrders(null);
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier, notified } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'missing', eventId: 'evt-3', confirmedSats: 100000 });

    expect(enqueued).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('throws on an illegal transition (e.g. from a terminal failed state)', async () => {
    const { repo } = makeFakeOrders('failed');
    const processedEvents = makeFakeProcessedEvents();
    const { queue } = makeFakeFulfillment();
    const { notifier } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await expect(
      confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-4', confirmedSats: 100000 }),
    ).rejects.toThrow();
  });

  it('recovers an order from expired to paid when the chain later confirms it, logging a distinct warning and recording it durably', async () => {
    const { repo, getStatus, recoveries } = makeFakeOrders('expired');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier } = makeFakeNotifier();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-6', confirmedSats: 100000 });

    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual(['order-1']);
    expect(warnSpy).toHaveBeenCalledWith(
      'confirm-payment: order recovered from expired to paid',
      expect.objectContaining({ orderId: 'order-1' }),
    );
    expect(recoveries).toEqual([{ orderId: 'order-1', from: 'expired' }]);
    warnSpy.mockRestore();
  });

  it('recovers an order from cancelled to paid when the chain later confirms it, logging a distinct warning and recording it durably', async () => {
    const { repo, getStatus, recoveries } = makeFakeOrders('cancelled');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier } = makeFakeNotifier();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-7', confirmedSats: 100000 });

    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual(['order-1']);
    expect(warnSpy).toHaveBeenCalledWith(
      'confirm-payment: order recovered from cancelled to paid',
      expect.objectContaining({ orderId: 'order-1' }),
    );
    expect(recoveries).toEqual([{ orderId: 'order-1', from: 'cancelled' }]);
    warnSpy.mockRestore();
  });

  it('still marks the event processed and enqueues fulfillment even if the notifier throws', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier } = makeFakeNotifier(true);
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-5', confirmedSats: 100000 });

    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual(['order-1']);
    expect(await processedEvents.seen('evt-5')).toBe(true);
  });
});
