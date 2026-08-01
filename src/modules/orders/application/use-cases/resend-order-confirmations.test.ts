import { describe, expect, it } from 'vitest';

import { ResendOrderConfirmations } from './resend-order-confirmations';
import type { OrderDetail, OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';
import type { SendOrderConfirmationEmailInput } from '@/modules/notifications/application/use-cases/send-order-confirmation-email';

function makeOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    customerEmail: 'buyer@example.com',
    createdAt: new Date(),
    currency: 'USD',
    amountMinor: 4200,
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    paymentRecoveredFrom: null,
    notes: null,
    discountAmountMinor: 0,
    couponCode: null,
    awaitingConfirmationSince: null,
    shippingAddress: null,
    shippingAmountMinor: 0,
    lines: [{ id: 'order-line-1', productId: 'v1', productName: 'Widget One', quantity: 2, unitAmountMinor: 2100, imageUrl: null }],
    ...overrides,
  };
}

function makeFakeOrders(idsByEmail: Record<string, string[]>, ordersById: Record<string, OrderDetail>) {
  const repo: Partial<OrderHistoryRepository> = {
    async findOrderIdsByEmail(email) {
      return idsByEmail[email] ?? [];
    },
    async findById(orderId) {
      return ordersById[orderId] ?? null;
    },
  };
  return repo as OrderHistoryRepository;
}

function makeFakeSender() {
  const sent: SendOrderConfirmationEmailInput[] = [];
  return {
    sender: { execute: async (input: SendOrderConfirmationEmailInput) => void sent.push(input) },
    sent,
  };
}

describe('ResendOrderConfirmations', () => {
  it('resends a confirmation email for every order under that email', async () => {
    const order1 = makeOrder({ id: 'order-1' });
    const order2 = makeOrder({ id: 'order-2', lines: [{ id: 'order-line-1', productId: 'v2', productName: 'Widget Two', quantity: 1, unitAmountMinor: 500, imageUrl: null }] });
    const orders = makeFakeOrders(
      { 'buyer@example.com': ['order-1', 'order-2'] },
      { 'order-1': order1, 'order-2': order2 },
    );
    const { sender, sent } = makeFakeSender();

    await new ResendOrderConfirmations(orders, sender, 'https://shop.example.com').execute({
      email: 'buyer@example.com',
    });

    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({
      customerEmail: 'buyer@example.com',
      orderId: 'order-1',
      lines: [{ productName: 'Widget One', quantity: 2 }],
      totalDisplay: '$42.00',
      orderUrl: 'https://shop.example.com/orders/order-1',
    });
    expect(sent[1]?.orderId).toBe('order-2');
  });

  it('is a no-op when the email matches no orders', async () => {
    const orders = makeFakeOrders({}, {});
    const { sender, sent } = makeFakeSender();

    await new ResendOrderConfirmations(orders, sender, 'https://shop.example.com').execute({
      email: 'nobody@example.com',
    });

    expect(sent).toEqual([]);
  });

  it('continues resending remaining orders even if one lookup returns null', async () => {
    const order1 = makeOrder({ id: 'order-1' });
    const orders = makeFakeOrders(
      { 'buyer@example.com': ['order-1', 'deleted-order'] },
      { 'order-1': order1 },
    );
    const { sender, sent } = makeFakeSender();

    await new ResendOrderConfirmations(orders, sender, 'https://shop.example.com').execute({
      email: 'buyer@example.com',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.orderId).toBe('order-1');
  });
});
