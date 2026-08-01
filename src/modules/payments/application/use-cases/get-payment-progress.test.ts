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
    async setPaymentStatus() {
      return true;
    },
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
      expectedSats: 0,
      confirmedSats: 0,
      pendingSats: 0,
      shortfallSats: 0,
      topUpUri: null,
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
      expectedSats: 100000,
      confirmedSats: 0,
      pendingSats: 0,
      shortfallSats: 100000,
      topUpUri: 'bitcoin:bc1qtest?amount=0.00100000',
    });
  });

  /**
   * The top-up path. An underpaid order stays open, and the customer is told
   * what is still owed against the *same* address — which is what makes a
   * top-up possible at all.
   */
  it('quotes the shortfall and a top-up URI for the same address when underpaid', async () => {
    const orders = makeFakeOrders('awaiting_confirmation');
    const paymentStore = makeFakePaymentStore(
      makeIntent({ confirmations: 1, confirmedSats: 40_000, underpaid: true }),
    );

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'order-1' });

    expect(result?.confirmedSats).toBe(40_000);
    expect(result?.shortfallSats).toBe(60_000);
    // Same address as the original quote, for the remainder only.
    expect(result?.topUpUri).toBe('bitcoin:bc1qtest?amount=0.00060000');
  });

  it('quotes no shortfall once enough has arrived', async () => {
    const orders = makeFakeOrders('awaiting_confirmation');
    const paymentStore = makeFakePaymentStore(
      makeIntent({ confirmations: 1, confirmedSats: 100_000, underpaid: false }),
    );

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'order-1' });

    expect(result?.shortfallSats).toBe(0);
    expect(result?.topUpUri).toBeNull();
  });

  it('never quotes a negative shortfall when overpaid', async () => {
    const orders = makeFakeOrders('awaiting_confirmation');
    const paymentStore = makeFakePaymentStore(
      makeIntent({ confirmations: 1, confirmedSats: 250_000, overpaid: true }),
    );

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'order-1' });

    expect(result?.shortfallSats).toBe(0);
    expect(result?.topUpUri).toBeNull();
  });

  it('offers no top-up once the order is closed, however short it was', async () => {
    // A failed or expired order is not collecting money any more, and inviting
    // a top-up against one would take a payment for something already dead.
    for (const status of ['failed', 'expired', 'cancelled'] as const) {
      const orders = makeFakeOrders(status);
      const paymentStore = makeFakePaymentStore(
        makeIntent({ confirmations: 1, confirmedSats: 40_000, underpaid: true }),
      );

      const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({ orderId: 'order-1' });

      expect(result?.shortfallSats, status).toBe(0);
      expect(result?.topUpUri, status).toBeNull();
    }
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
      expectedSats: 100000,
      confirmedSats: 0,
      pendingSats: 0,
      shortfallSats: 0,
      topUpUri: null,
    });
  });
});

describe('GetPaymentProgress and a payment still in the mempool', () => {
  it('does not ask for a balance that is already on its way', async () => {
    // The widget renders a top-up QR from `shortfallSats`. Computed against
    // confirmed value alone, a customer whose full payment was sitting in the
    // mempool was shown "you still owe 100,000 sats" and a QR to pay it —
    // which is how someone pays twice for one order, with no refund path.
    const orders = makeFakeOrders('awaiting_confirmation');
    const paymentStore = makeFakePaymentStore(
      makeIntent({ expectedSats: 100_000, confirmedSats: 0, pendingSats: 100_000 }),
    );

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({
      orderId: 'order-1',
    });

    expect(result?.shortfallSats).toBe(0);
    expect(result?.topUpUri).toBeNull();
    // Still reported, so the page can say "we can see your payment".
    expect(result?.pendingSats).toBe(100_000);
  });

  it('asks only for the part that is genuinely still missing', async () => {
    const orders = makeFakeOrders('awaiting_confirmation');
    const paymentStore = makeFakePaymentStore(
      makeIntent({ expectedSats: 100_000, confirmedSats: 30_000, pendingSats: 20_000 }),
    );

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({
      orderId: 'order-1',
    });

    expect(result?.shortfallSats).toBe(50_000);
  });

  it('reports nothing pending when the intent predates the column', async () => {
    const orders = makeFakeOrders('awaiting_payment');
    const paymentStore = makeFakePaymentStore(makeIntent({ expectedSats: 100_000 }));

    const result = await new GetPaymentProgress(orders, paymentStore, 2).execute({
      orderId: 'order-1',
    });

    expect(result?.pendingSats).toBe(0);
    expect(result?.shortfallSats).toBe(100_000);
  });
});
