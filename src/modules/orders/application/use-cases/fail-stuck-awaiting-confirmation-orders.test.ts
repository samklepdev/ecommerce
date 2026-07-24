import { describe, expect, it } from 'vitest';

import {
  FailStuckAwaitingConfirmationOrders,
  type StuckAwaitingConfirmationOrderRepository,
} from './fail-stuck-awaiting-confirmation-orders';

function makeFakeOrders(stuckIds: string[], failingId?: string) {
  const failed: string[] = [];
  const repo: StuckAwaitingConfirmationOrderRepository = {
    async findStuckAwaitingConfirmationOrderIds() {
      return stuckIds;
    },
    async tryFailStuckAwaitingConfirmation(orderId) {
      if (orderId === failingId) throw new Error('boom');
      failed.push(orderId);
      return true;
    },
  };
  return { repo, failed };
}

describe('FailStuckAwaitingConfirmationOrders', () => {
  it('fails every order returned as stuck', async () => {
    const { repo, failed } = makeFakeOrders(['order-1', 'order-2']);
    await new FailStuckAwaitingConfirmationOrders(repo).execute();
    expect(failed).toEqual(['order-1', 'order-2']);
  });

  it('is a no-op when nothing is stuck', async () => {
    const { repo, failed } = makeFakeOrders([]);
    await new FailStuckAwaitingConfirmationOrders(repo).execute();
    expect(failed).toEqual([]);
  });

  it('continues failing remaining orders even if one fails', async () => {
    const { repo, failed } = makeFakeOrders(['order-1', 'order-2', 'order-3'], 'order-2');
    await new FailStuckAwaitingConfirmationOrders(repo).execute();
    expect(failed).toEqual(['order-1', 'order-3']);
  });
});
