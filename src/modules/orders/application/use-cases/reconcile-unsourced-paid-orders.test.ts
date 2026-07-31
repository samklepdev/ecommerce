import { describe, expect, it, vi } from 'vitest';

import {
  ReconcileUnsourcedPaidOrders,
  type UnsourcedPaidOrderRepository,
} from './reconcile-unsourced-paid-orders';
import type { FulfillmentQueue } from './confirm-payment';
import { logger } from '@/shared/infrastructure/logger';

function makeFakeOrders(orderIds: string[]) {
  const askedFor: Date[] = [];
  const repo: UnsourcedPaidOrderRepository = {
    async findPaidOrderIdsWithUnattemptedLines(idleSince) {
      askedFor.push(idleSince);
      return orderIds;
    },
  };
  return { repo, askedFor };
}

function makeFakeFulfillment(failFor?: string) {
  const enqueued: string[] = [];
  const queue: FulfillmentQueue = {
    async enqueueOrderPaid(orderId) {
      if (failFor === orderId) throw new Error('redis unavailable');
      enqueued.push(orderId);
    },
  };
  return { queue, enqueued };
}

describe('ReconcileUnsourcedPaidOrders', () => {
  it('re-queues sourcing for a paid order whose lines were never attempted', async () => {
    const { repo } = makeFakeOrders(['order-1']);
    const { queue, enqueued } = makeFakeFulfillment();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await new ReconcileUnsourcedPaidOrders(repo, queue).execute();

    expect(enqueued).toEqual(['order-1']);
    // Finding anything here means a queued job was lost. It self-heals, but
    // somebody should know the queue dropped work.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('re-queued sourcing'),
      expect.objectContaining({ orderId: 'order-1' }),
    );
    warnSpy.mockRestore();
  });

  it('does nothing when there is nothing outstanding — the normal case', async () => {
    const { repo } = makeFakeOrders([]);
    const { queue, enqueued } = makeFakeFulfillment();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await new ReconcileUnsourcedPaidOrders(repo, queue).execute();

    expect(enqueued).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('only considers orders that have been idle a while', async () => {
    // Without this the pass would fire in the seconds between ConfirmPayment
    // marking the order paid and the sourcing job actually running, and would
    // be relying on BullMQ's job-id de-dupe to save it — which CLAUDE.md is
    // explicit is a second line of defence, not the guard.
    const { repo, askedFor } = makeFakeOrders([]);
    const { queue } = makeFakeFulfillment();
    const now = new Date('2026-07-31T12:00:00Z');

    await new ReconcileUnsourcedPaidOrders(repo, queue, () => now).execute();

    expect(askedFor).toHaveLength(1);
    const idleMinutes = (now.getTime() - askedFor[0]!.getTime()) / 60_000;
    expect(idleMinutes).toBeGreaterThanOrEqual(10);
    expect(idleMinutes).toBeLessThanOrEqual(60);
  });

  it('keeps going when one enqueue fails', async () => {
    const { repo } = makeFakeOrders(['order-a', 'order-b']);
    const { queue, enqueued } = makeFakeFulfillment('order-a');
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new ReconcileUnsourcedPaidOrders(repo, queue).execute();

    expect(enqueued).toEqual(['order-b']);
    expect(errorSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
