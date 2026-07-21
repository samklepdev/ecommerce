import { describe, expect, it } from 'vitest';

import { ListAllOrdersForAdmin } from './list-all-orders-for-admin';
import type { OrderHistoryRepository, OrderListItem } from '@/modules/orders/application/ports/order-history-repository';

function makeOrder(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: 'order-1',
    customerEmail: 'buyer@example.com',
    createdAt: new Date(),
    currency: 'USD',
    amountMinor: 1999,
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    ...overrides,
  };
}

function makeFakeRepo(orders: OrderListItem[]) {
  const calls: (string | undefined)[] = [];
  const repo: Partial<OrderHistoryRepository> = {
    async listAllForAdmin(params) {
      calls.push(params?.email);
      return params?.email ? orders.filter((o) => o.customerEmail.includes(params.email!)) : orders;
    },
  };
  return { repo: repo as OrderHistoryRepository, calls };
}

describe('ListAllOrdersForAdmin', () => {
  it('returns every order when no email filter is given', async () => {
    const orders = [makeOrder({ id: 'order-1' }), makeOrder({ id: 'order-2', customerEmail: 'other@example.com' })];
    const { repo } = makeFakeRepo(orders);

    const result = await new ListAllOrdersForAdmin(repo).execute({});

    expect(result).toEqual(orders);
  });

  it('passes the email filter through to the repository', async () => {
    const orders = [makeOrder({ id: 'order-1' }), makeOrder({ id: 'order-2', customerEmail: 'other@example.com' })];
    const { repo, calls } = makeFakeRepo(orders);

    const result = await new ListAllOrdersForAdmin(repo).execute({ email: 'buyer' });

    expect(calls).toEqual(['buyer']);
    expect(result).toEqual([orders[0]]);
  });
});
