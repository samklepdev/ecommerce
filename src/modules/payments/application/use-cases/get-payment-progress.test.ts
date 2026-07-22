import { describe, expect, it } from 'vitest';

import { GetPaymentProgress } from './get-payment-progress';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import type { BitcoinPaymentIntent, BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';

function makeFakeOrders(status: PaymentStatus | null) {
  const repo: ConfirmPaymentOrderRepository = {
    async getPaymentStatus() {
      return status;
    },
    async setPaymentStatus() {},
    async recordPaymentRecovery() {},
  };
  return repo;
}

function makeFakePaymentStore(intent: BitcoinPaymentIntent | null) {
  const store: Partial<BitcoinPaymentStore> = {
    async getByOrderId() {
      return intent;
    },
  };
  return store as BitcoinPaymentStore;
}

function makeIntent(overrides: Partial<BitcoinPaymentIntent> = {}): BitcoinPaymentIntent {
  return {
    orderId: 'order-1',
    address: 'bc1qtest',
    addressIndex: 0,
    expectedSats: 100000,
    fiatCurrency: 'USD',
    satsPerFiatUnit: 100,
    expiresAt: new Date(Date.now() + 60_000),
    status: 'awaiting',
    ...overrides,
  };
}

describe('GetPaymentProgress', () => {
  it('returns null when the order does not exist', async () => {
    const orders = makeFakeOrders(null);
    const paymentStore = makeFakePaymentStore(null);

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'missing' });

    expect(result).toBeNull();
  });

  it('defaults confirmations/underpaid when no payment intent exists yet', async () => {
    const orders = makeFakeOrders('pending');
    const paymentStore = makeFakePaymentStore(null);

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'order-1' });

    expect(result).toEqual({
      status: 'pending',
      confirmations: 0,
      requiredConfirmations: 2,
      underpaid: false,
      overpaid: false,
    });
  });

  it('passes through confirmations/underpaid/overpaid from the payment intent when present', async () => {
    const orders = makeFakeOrders('awaiting_confirmation');
    const paymentStore = makeFakePaymentStore(makeIntent({ confirmations: 1, underpaid: true, overpaid: false }));

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'order-1' });

    expect(result).toEqual({
      status: 'awaiting_confirmation',
      confirmations: 1,
      requiredConfirmations: 2,
      underpaid: true,
      overpaid: false,
    });
  });

  it('surfaces overpaid from the payment intent', async () => {
    const orders = makeFakeOrders('paid');
    const paymentStore = makeFakePaymentStore(makeIntent({ confirmations: 2, underpaid: false, overpaid: true }));

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'order-1' });

    expect(result).toEqual({
      status: 'paid',
      confirmations: 2,
      requiredConfirmations: 2,
      underpaid: false,
      overpaid: true,
    });
  });
});
