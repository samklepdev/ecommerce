import { describe, expect, it } from 'vitest';

import { ConfirmPayment, type FulfillmentQueue, type ProcessedEventStore } from './confirm-payment';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import type { PaymentConfirmationNotifier } from '@/modules/orders/application/ports/payment-confirmation-notifier';

function makeFakeOrders(initialStatus: PaymentStatus | null) {
  let status = initialStatus;
  const repo: ConfirmPaymentOrderRepository = {
    async getPaymentStatus() {
      return status;
    },
    async setPaymentStatus(_orderId, next) {
      status = next;
    },
  };
  return { repo, getStatus: () => status };
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

function makeFakeFulfillment() {
  const enqueued: string[] = [];
  const queue: FulfillmentQueue = {
    async enqueueOrderPaid(orderId) {
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

  it('is a guarded no-op if the order is already paid (re-entrant, different event id)', async () => {
    const { repo, getStatus } = makeFakeOrders('paid');
    const processedEvents = makeFakeProcessedEvents();
    const { queue, enqueued } = makeFakeFulfillment();
    const { notifier, notified } = makeFakeNotifier();
    const confirmPayment = new ConfirmPayment(repo, processedEvents, queue, notifier);

    await confirmPayment.execute({ orderId: 'order-1', eventId: 'evt-2', confirmedSats: 100000 });

    expect(getStatus()).toBe('paid');
    expect(enqueued).toEqual([]); // never re-enqueued
    expect(notified).toEqual([]); // never re-notified
    expect(await processedEvents.seen('evt-2')).toBe(true);
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
