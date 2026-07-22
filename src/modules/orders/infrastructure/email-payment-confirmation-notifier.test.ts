import { describe, expect, it } from 'vitest';

import { EmailPaymentConfirmationNotifier } from './email-payment-confirmation-notifier';
import type { OrderDetail, OrderHistoryRepository } from '@/modules/orders/application/ports/order-history-repository';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';

function makeFakeOrderHistory(order: OrderDetail | null) {
  const repo: Partial<OrderHistoryRepository> = {
    async findById() {
      return order;
    },
  };
  return repo as OrderHistoryRepository;
}

function makeFakeEmailSender() {
  const sent: { to: string; subject: string; html: string }[] = [];
  const sender: EmailSender = {
    async send(to, subject, html) {
      sent.push({ to, subject, html });
    },
  };
  return { sender, sent };
}

function makeOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    createdAt: new Date(),
    currency: 'USD',
    amountMinor: 4200,
    paymentStatus: 'paid',
    fulfillmentStatus: 'unfulfilled',
    customerEmail: 'buyer@example.com',
    shippingAddress: null,
    shippingAmountMinor: 0,
    paymentRecoveredFrom: null,
    lines: [{ sku: 'SKU-1', quantity: 2, unitAmountMinor: 2100 }],
    ...overrides,
  };
}

describe('EmailPaymentConfirmationNotifier', () => {
  it('emails the order total to the customer for an existing order', async () => {
    const orderHistory = makeFakeOrderHistory(makeOrder());
    const { sender, sent } = makeFakeEmailSender();

    await new EmailPaymentConfirmationNotifier(orderHistory, sender, 'https://shop.example.com').notifyPaymentConfirmed(
      'order-1',
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('buyer@example.com');
    expect(sent[0]?.html).toContain('4200 USD');
    expect(sent[0]?.html).toContain('https://shop.example.com/orders/order-1');
  });

  it('is a no-op when the order no longer exists', async () => {
    const orderHistory = makeFakeOrderHistory(null);
    const { sender, sent } = makeFakeEmailSender();

    await new EmailPaymentConfirmationNotifier(orderHistory, sender, 'https://shop.example.com').notifyPaymentConfirmed(
      'missing',
    );

    expect(sent).toHaveLength(0);
  });
});
