import { describe, expect, it } from 'vitest';

import { CancelOrder } from './cancel-order';
import type { CancelOrderRepository } from '@/modules/orders/application/ports/cancel-order-repository';

function makeFakeRepo(result: boolean) {
  const calls: { orderId: string; ownerUserId: string | null }[] = [];
  const repo: CancelOrderRepository = {
    async cancelOrder(orderId, ownerUserId) {
      calls.push({ orderId, ownerUserId });
      return result;
    },
  };
  return { repo, calls };
}

describe('CancelOrder', () => {
  it('succeeds when the repository reports the cancellation went through', async () => {
    const { repo, calls } = makeFakeRepo(true);
    const result = await new CancelOrder(repo).execute({ orderId: 'order-1', userId: 'user-1' });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ orderId: 'order-1', ownerUserId: 'user-1' }]);
  });

  it('passes through a null userId for the guest/id-only path', async () => {
    const { repo, calls } = makeFakeRepo(true);
    await new CancelOrder(repo).execute({ orderId: 'order-1', userId: null });
    expect(calls).toEqual([{ orderId: 'order-1', ownerUserId: null }]);
  });

  it('returns not_cancellable when the repository reports it did not cancel', async () => {
    const { repo } = makeFakeRepo(false);
    const result = await new CancelOrder(repo).execute({ orderId: 'order-1', userId: 'user-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_cancellable');
  });
});
