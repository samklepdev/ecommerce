import { describe, expect, it } from 'vitest';

import { ListAllOrdersForAdmin } from './list-all-orders-for-admin';
import type {
  AdminOrderFilter,
  OrderHistoryRepository,
  OrderListItem,
} from '@/modules/orders/application/ports/order-history-repository';

function makeOrder(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: 'order-1',
    customerEmail: 'buyer@example.com',
    createdAt: new Date(),
    currency: 'USD',
    amountMinor: 1999,
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    paymentRecoveredFrom: null,
    ...overrides,
  };
}

/** Stands in for the SQL: applies the filter, then LIMIT/OFFSET, and records
 * what it was asked for so the test can assert the slice happened in the
 * query rather than afterwards. */
function makeFakeRepo(orders: OrderListItem[]) {
  const calls: { filter: AdminOrderFilter; limit: number; offset: number }[] = [];
  const matching = (filter: AdminOrderFilter) =>
    filter.email ? orders.filter((o) => o.customerEmail.includes(filter.email!)) : orders;

  const repo: Partial<OrderHistoryRepository> = {
    async listAllForAdmin(filter, limit, offset) {
      calls.push({ filter, limit, offset });
      return matching(filter).slice(offset, offset + limit);
    },
    async countAllForAdmin(filter) {
      return matching(filter).length;
    },
  };
  return { repo: repo as OrderHistoryRepository, calls };
}

describe('ListAllOrdersForAdmin', () => {
  it('returns the first page and the total, not every order in the store', async () => {
    const orders = Array.from({ length: 25 }, (_, i) => makeOrder({ id: `order-${i + 1}` }));
    const { repo, calls } = makeFakeRepo(orders);

    const result = await new ListAllOrdersForAdmin(repo).execute({ page: 1, pageSize: 10 });

    expect(calls).toEqual([{ filter: { email: undefined }, limit: 10, offset: 0 }]);
    expect(result.items).toHaveLength(10);
    expect(result).toMatchObject({ page: 1, totalPages: 3, totalItems: 25 });
  });

  it('offsets to the requested page', async () => {
    const orders = Array.from({ length: 25 }, (_, i) => makeOrder({ id: `order-${i + 1}` }));
    const { repo, calls } = makeFakeRepo(orders);

    const result = await new ListAllOrdersForAdmin(repo).execute({ page: 3, pageSize: 10 });

    expect(calls[0]?.offset).toBe(20);
    expect(result.items).toHaveLength(5);
    expect(result.items[0]?.id).toBe('order-21');
  });

  it('counts and pages within the email filter, not across all orders', async () => {
    const orders = [
      makeOrder({ id: 'order-1' }),
      makeOrder({ id: 'order-2', customerEmail: 'other@example.com' }),
    ];
    const { repo, calls } = makeFakeRepo(orders);

    const result = await new ListAllOrdersForAdmin(repo).execute({
      page: 1,
      pageSize: 10,
      email: 'buyer',
    });

    expect(calls[0]?.filter).toEqual({ email: 'buyer' });
    expect(result.items).toEqual([orders[0]]);
    expect(result.totalItems).toBe(1);
  });
});
