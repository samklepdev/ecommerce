import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { Order } from './order';
import { OrderLine } from './order-line';
import { ShippingAddress } from './shipping-address';
import { Money } from '@/shared/domain/money';

function makeShippingAddress() {
  return ShippingAddress.create({
    name: 'Test Customer',
    line1: '1 Test St',
    city: 'Testville',
    region: 'TS',
    postalCode: '00000',
    country: 'US',
  });
}

function makeLine(unitAmountMinor: number, quantity: number) {
  return OrderLine.create({
    id: randomUUID(),
    variantId: randomUUID(),
    sku: 'TEST-SKU',
    quantity,
    unitPrice: Money.of(unitAmountMinor, 'USD'),
  });
}

function makeOrder(lines = [makeLine(1000, 1)]) {
  return Order.create({
    id: randomUUID(),
    userId: null,
    customerEmail: 'test@example.com',
    shippingAddress: makeShippingAddress(),
    lines,
    currency: 'USD',
    paymentStatus: 'pending',
    fulfillmentStatus: 'unfulfilled',
  });
}

describe('Order.create', () => {
  it('throws when there are no lines', () => {
    expect(() => makeOrder([])).toThrow(/at least one line/);
  });

  it('creates an order with at least one line', () => {
    const order = makeOrder();
    expect(order.paymentStatus).toBe('pending');
    expect(order.fulfillmentStatus).toBe('unfulfilled');
  });
});

describe('Order#total', () => {
  it('sums the subtotal of every line', () => {
    const order = makeOrder([makeLine(1000, 2), makeLine(500, 3)]);
    // (1000 * 2) + (500 * 3) = 3500
    expect(order.total.amountMinor).toBe(3500);
    expect(order.total.currency).toBe('USD');
  });
});

describe('Order#withPaymentStatus', () => {
  it('returns a new Order with the updated payment status on a legal transition', () => {
    const order = makeOrder();
    const next = order.withPaymentStatus('awaiting_payment');
    expect(next.paymentStatus).toBe('awaiting_payment');
    expect(next).not.toBe(order);
    expect(order.paymentStatus).toBe('pending');
  });

  it('throws on an illegal transition', () => {
    const order = makeOrder();
    expect(() => order.withPaymentStatus('paid')).toThrow();
  });
});

describe('Order#withFulfillmentStatus', () => {
  it('returns a new Order with the updated fulfillment status once paid', () => {
    const order = makeOrder()
      .withPaymentStatus('awaiting_payment')
      .withPaymentStatus('paid');
    const next = order.withFulfillmentStatus('processing');
    expect(next.fulfillmentStatus).toBe('processing');
  });

  it('throws when trying to fulfill before payment is paid', () => {
    const order = makeOrder();
    expect(() => order.withFulfillmentStatus('processing')).toThrow();
  });
});
