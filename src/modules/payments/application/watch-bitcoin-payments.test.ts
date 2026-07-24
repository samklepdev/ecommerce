import { describe, expect, it } from 'vitest';

import { WatchBitcoinPayments } from './watch-bitcoin-payments';
import { ConfirmPayment } from '@/modules/orders/application/use-cases/confirm-payment';
import {
  MarkAwaitingConfirmation,
  type MarkAwaitingConfirmationOrderRepository,
} from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import type {
  AddressChainStatus,
  BitcoinPaymentIntent,
  BitcoinPaymentStore,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';

const REQUIRED_CONFIRMATIONS = 2;

type FakeOrders = ConfirmPaymentOrderRepository & MarkAwaitingConfirmationOrderRepository;

function makeFakeOrders(initialStatus: PaymentStatus) {
  let status = initialStatus;
  const repo: FakeOrders = {
    async getPaymentStatus() {
      return status;
    },
    async setPaymentStatus(_orderId, next) {
      status = next;
    },
    async recordPaymentRecovery() {},
    async markAwaitingConfirmation() {
      status = 'awaiting_confirmation';
    },
  };
  return { repo, getStatus: () => status };
}

function makeFakeChain(status: AddressChainStatus): ChainDataProvider {
  return { getStatus: async () => status };
}

interface Progress {
  confirmations: number;
  underpaid: boolean;
  overpaid: boolean;
}

function makeFakePaymentStore(intent: BitcoinPaymentIntent) {
  const progressByOrderId = new Map<string, Progress>();
  let confirmedCalled = false;
  const store: BitcoinPaymentStore = {
    async save() {},
    async getByOrderId() {
      return intent;
    },
    async listWatchable() {
      return [intent];
    },
    async markConfirmed() {
      confirmedCalled = true;
    },
    async markExpired() {},
    async markCancelled() {},
    async recordProgress(orderId, progress) {
      progressByOrderId.set(orderId, progress);
    },
  };
  return { store, getProgress: () => progressByOrderId.get(intent.orderId), wasConfirmed: () => confirmedCalled };
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

function makeWatcher(paymentStore: BitcoinPaymentStore, chain: ChainDataProvider, orders: FakeOrders) {
  const processedEvents = { seen: async () => false, markSeen: async () => {} };
  const fulfillment = { enqueueOrderPaid: async () => {} };
  const paymentConfirmationNotifier = { notifyPaymentConfirmed: async () => {} };
  const confirmPayment = new ConfirmPayment(orders, processedEvents, fulfillment, paymentConfirmationNotifier);
  const markAwaitingConfirmation = new MarkAwaitingConfirmation(orders);
  return new WatchBitcoinPayments(paymentStore, chain, confirmPayment, markAwaitingConfirmation, REQUIRED_CONFIRMATIONS);
}

describe('WatchBitcoinPayments#runOnce', () => {
  it('marks awaiting_confirmation and records progress when underpaid', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress, wasConfirmed } = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 5000, confirmations: 0 });

    await makeWatcher(store, chain, repo).runOnce();

    expect(getStatus()).toBe('awaiting_confirmation');
    expect(getProgress()).toEqual({ confirmations: 0, underpaid: true, overpaid: false });
    expect(wasConfirmed()).toBe(false);
  });

  it('marks awaiting_confirmation and records progress when seen but shallow (not underpaid)', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress, wasConfirmed } = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 100000, confirmations: 1 });

    await makeWatcher(store, chain, repo).runOnce();

    expect(getStatus()).toBe('awaiting_confirmation');
    expect(getProgress()).toEqual({ confirmations: 1, underpaid: false, overpaid: false });
    expect(wasConfirmed()).toBe(false);
  });

  it('confirms payment once fully paid with enough confirmations', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress, wasConfirmed } = makeFakePaymentStore(intent);
    const chain = makeFakeChain({
      address: intent.address,
      confirmedSats: 100000,
      confirmations: REQUIRED_CONFIRMATIONS,
    });

    await makeWatcher(store, chain, repo).runOnce();

    expect(getStatus()).toBe('paid');
    expect(getProgress()).toEqual({
      confirmations: REQUIRED_CONFIRMATIONS,
      underpaid: false,
      overpaid: false,
    });
    expect(wasConfirmed()).toBe(true);
  });

  it('confirms payment normally when overpaid — excess sats never withhold fulfillment', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_confirmation');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress, wasConfirmed } = makeFakePaymentStore(intent);
    const chain = makeFakeChain({
      address: intent.address,
      confirmedSats: 250000, // more than double what was expected
      confirmations: REQUIRED_CONFIRMATIONS,
    });

    await makeWatcher(store, chain, repo).runOnce();

    expect(getStatus()).toBe('paid');
    expect(getProgress()).toEqual({
      confirmations: REQUIRED_CONFIRMATIONS,
      underpaid: false,
      overpaid: true,
    });
    expect(wasConfirmed()).toBe(true);
  });

  it('clears a stale underpaid flag once a later pass fully confirms (no leftover underpaid: true on a paid order)', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress } = makeFakePaymentStore(intent);

    // Pass 1: underpaid.
    const underpaidChain = makeFakeChain({ address: intent.address, confirmedSats: 5000, confirmations: 0 });
    await makeWatcher(store, underpaidChain, repo).runOnce();
    expect(getProgress()?.underpaid).toBe(true);

    // Pass 2: customer tops up, goes straight to full-confirm in one shot.
    const fullChain = makeFakeChain({
      address: intent.address,
      confirmedSats: 100000,
      confirmations: REQUIRED_CONFIRMATIONS,
    });
    await makeWatcher(store, fullChain, repo).runOnce();

    expect(getStatus()).toBe('paid');
    expect(getProgress()).toEqual({
      confirmations: REQUIRED_CONFIRMATIONS,
      underpaid: false,
      overpaid: false,
    });
  });
});
