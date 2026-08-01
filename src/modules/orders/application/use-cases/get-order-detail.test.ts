import { describe, expect, it } from 'vitest';

import { GetOrderDetail } from './get-order-detail';
import type { OrderDetail, OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';

function makeFakeOrderHistory(ordersById: Map<string, OrderDetail>) {
  const repo: Partial<OrderHistoryRepository> = {
    async findById(orderId: string) {
      return ordersById.get(orderId) ?? null;
    },
  };
  return repo as OrderHistoryRepository;
}

function makeOrderDetail(id: string): OrderDetail {
  return {
    id,
    createdAt: new Date(),
    currency: 'USD',
    amountMinor: 1999,
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    customerEmail: 'guest@example.com',
    shippingAddress: null,
    shippingAmountMinor: 0,
    paymentRecoveredFrom: null,
    notes: null,
    discountAmountMinor: 0,
    couponCode: null,
    awaitingConfirmationSince: null,
    lines: [],
  };
}

describe('GetOrderDetail', () => {
  it('returns the order for any caller — no userId scoping', async () => {
    const order = makeOrderDetail('order-1');
    const orderHistory = makeFakeOrderHistory(new Map([['order-1', order]]));

    const result = await new GetOrderDetail(orderHistory).execute({ orderId: 'order-1' });

    expect(result).toEqual(order);
  });

  it('returns null when no order matches the id', async () => {
    const orderHistory = makeFakeOrderHistory(new Map());

    const result = await new GetOrderDetail(orderHistory).execute({ orderId: 'missing' });

    expect(result).toBeNull();
  });
});
