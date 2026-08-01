import { describe, expect, it } from 'vitest';

import { WatchBitcoinPayments } from './watch-bitcoin-payments';
import { NotifyUnderpaidOnce } from '@/modules/orders/application/use-cases/notify-underpaid-once';
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
    async setPaymentStatus(_orderId, next, expectedFrom) {
      if (status !== expectedFrom) return false;
      status = next;
      return true;
    },
    async recordPaymentRecovery() {},
    async markAwaitingConfirmation() {
      status = 'awaiting_confirmation';
    },
  };
  return { repo, getStatus: () => status };
}

/** `pendingSats` defaults to 0 so the many tests that predate mempool
 * awareness read as "nothing unconfirmed", which is what they mean. */
function makeFakeChain(status: Omit<AddressChainStatus, 'pendingSats'> & { pendingSats?: number }): ChainDataProvider {
  return { getStatus: async () => ({ pendingSats: 0, ...status }) };
}

interface Progress {
  confirmations: number;
  confirmedSats: number;
  pendingSats: number;
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
    async highestAddressIndex() {
      return null;
    },
    async markConfirmed() {
      confirmedCalled = true;
    },
    async markExpired() {},
    async reprice() {},
    async markCancelled() {},
    async listSweepable() {
      return [];
    },
    async recordLatePayment() {
      return true;
    },
    async countLatePayments() {
      return 0;
    },
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

/** `notifyUnderpaid` is injectable so the one test that cares about the
 * customer being told can assert on it; every other test gets a throwaway. */
function makeWatcher(
  paymentStore: BitcoinPaymentStore,
  chain: ChainDataProvider,
  orders: FakeOrders,
  notifyUnderpaid: NotifyUnderpaidOnce = makeNotifyUnderpaid().notify,
) {
  const processedEvents = { seen: async () => false, markSeen: async () => {} };
  const fulfillment = { enqueueOrderPaid: async () => {}, requeueOrderPaid: async () => {} };
  const paymentConfirmationNotifier = { notifyPaymentConfirmed: async () => {} };
  const confirmPayment = new ConfirmPayment(orders, processedEvents, fulfillment, paymentConfirmationNotifier);
  const markAwaitingConfirmation = new MarkAwaitingConfirmation(orders);
  return new WatchBitcoinPayments(
    paymentStore,
    chain,
    confirmPayment,
    markAwaitingConfirmation,
    REQUIRED_CONFIRMATIONS,
    notifyUnderpaid,
  );
}

function makeNotifyUnderpaid() {
  const notified: string[] = [];
  const seenIds = new Set<string>();
  const notify = new NotifyUnderpaidOnce(
    {
      async seen(id) {
        return seenIds.has(id);
      },
      async markSeen(id) {
        seenIds.add(id);
      },
    },
    {
      async notifyUnderpaid(orderId) {
        notified.push(orderId);
      },
    },
  );
  return { notify, notified };
}

describe('WatchBitcoinPayments#runOnce', () => {
  // The distinction the rest of the system is built on: "hasn't paid" is not
  // "paid the wrong amount". Without a `confirmedSats > 0` guard, 0 is less
  // than expected-minus-dust, so every unpaid order looked underpaid on the
  // first poll — which took it out of reach of expiry and of cancellation.
  it('leaves an order alone while nothing has arrived on-chain', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress, wasConfirmed } = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 0, confirmations: 0 });

    await makeWatcher(store, chain, repo).runOnce();

    expect(getStatus()).toBe('awaiting_payment');
    expect(wasConfirmed()).toBe(false);
    // Still recorded, so "we looked and saw nothing" is distinguishable from
    // "we never looked".
    expect(getProgress()).toEqual({
      confirmations: 0,
      // Nothing seen, and recorded as such rather than left unknown.
      confirmedSats: 0,
      pendingSats: 0,
      underpaid: false,
      overpaid: false,
    });
  });

  it('marks awaiting_confirmation and records progress when underpaid', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress, wasConfirmed } = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 5000, confirmations: 0 });

    await makeWatcher(store, chain, repo).runOnce();

    expect(getStatus()).toBe('awaiting_confirmation');
    expect(getProgress()).toEqual({
      confirmations: 0,
      // The shortfall is the actionable part: 5,000 against 100,000 expected.
      confirmedSats: 5000,
      pendingSats: 0,
      underpaid: true,
      overpaid: false,
    });
    expect(wasConfirmed()).toBe(false);
  });

  it('tells the customer once when their payment is short', async () => {
    const intent = makeIntent();
    const paymentStore = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 5000, confirmations: 0 });
    const { repo: orders } = makeFakeOrders('awaiting_payment');
    const { notify, notified } = makeNotifyUnderpaid();
    const watcher = makeWatcher(paymentStore.store, chain, orders, notify);

    // Three passes, as the real loop would do inside two minutes.
    await watcher.runOnce();
    await watcher.runOnce();
    await watcher.runOnce();

    // Once. A short payment stays short until they act, so the naive call would
    // mail them every 45 seconds for up to 48 hours.
    expect(notified).toEqual([intent.orderId]);
  });

  it('does not tell the customer anything when the payment is merely shallow', async () => {
    // Nothing is owed and nothing is needed from them — it just needs blocks.
    const intent = makeIntent();
    const paymentStore = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 100000, confirmations: 1 });
    const { repo: orders } = makeFakeOrders('awaiting_payment');
    const { notify, notified } = makeNotifyUnderpaid();

    await makeWatcher(paymentStore.store, chain, orders, notify).runOnce();

    expect(notified).toEqual([]);
  });

  it('does not tell the customer anything when nothing has arrived', async () => {
    const intent = makeIntent();
    const paymentStore = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 0, confirmations: 0 });
    const { repo: orders } = makeFakeOrders('awaiting_payment');
    const { notify, notified } = makeNotifyUnderpaid();

    await makeWatcher(paymentStore.store, chain, orders, notify).runOnce();

    expect(notified).toEqual([]);
  });

  it('marks awaiting_confirmation and records progress when seen but shallow (not underpaid)', async () => {
    const { repo, getStatus } = makeFakeOrders('awaiting_payment');
    const intent = makeIntent({ expectedSats: 100000 });
    const { store, getProgress, wasConfirmed } = makeFakePaymentStore(intent);
    const chain = makeFakeChain({ address: intent.address, confirmedSats: 100000, confirmations: 1 });

    await makeWatcher(store, chain, repo).runOnce();

    expect(getStatus()).toBe('awaiting_confirmation');
    expect(getProgress()).toEqual({
      confirmations: 1,
      confirmedSats: 100000,
      pendingSats: 0,
      underpaid: false,
      overpaid: false,
    });
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
      confirmedSats: 100000,
      pendingSats: 0,
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
      // Overpayment: how much extra arrived is exactly what an admin needs.
      confirmedSats: 250000,
      pendingSats: 0,
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
      confirmedSats: 100000,
      pendingSats: 0,
      underpaid: false,
      overpaid: false,
    });
  });

  describe('a payment still in the mempool', () => {
    // Why any of this exists: only confirmed value used to count, so a
    // customer who had broadcast but not yet confirmed was indistinguishable
    // from one who had done nothing. Their order kept ticking toward expiry,
    // and the checkout widget offered them a re-quote that moved the goalposts
    // under a payment already in flight.

    it('holds the order open instead of leaving it exposed to expiry', async () => {
      const { repo, getStatus } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store, wasConfirmed } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 0,
        pendingSats: 100000,
        confirmations: 0,
      });

      await makeWatcher(store, chain, repo).runOnce();

      // awaiting_confirmation is out of reach of ExpireStaleCheckouts, stays
      // in listWatchable, and is refused by RefreshPaymentQuote — one status
      // change closing all three holes.
      expect(getStatus()).toBe('awaiting_confirmation');
      expect(wasConfirmed()).toBe(false);
    });

    it('is never enough on its own to mark an order paid', async () => {
      const { repo, getStatus } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store, wasConfirmed } = makeFakePaymentStore(intent);
      // Deliberately absurd: deep confirmations reported alongside zero
      // confirmed value. Settlement must key on the money, not the depth.
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 0,
        pendingSats: 100000,
        confirmations: 50,
      });

      await makeWatcher(store, chain, repo).runOnce();

      expect(getStatus()).toBe('awaiting_confirmation');
      expect(wasConfirmed()).toBe(false);
    });

    it('does not demand a balance from a customer whose payment is merely unconfirmed', async () => {
      // The trap. Making `seen` true on mempool value while `underpaid` still
      // read confirmed-only would fire "you still owe 100,000 sats" at someone
      // who had paid in full sixty seconds earlier — the original bug wearing
      // a different hat.
      const intent = makeIntent({ expectedSats: 100000 });
      const paymentStore = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 0,
        pendingSats: 100000,
        confirmations: 0,
      });
      const { repo: orders } = makeFakeOrders('awaiting_payment');
      const { notify, notified } = makeNotifyUnderpaid();

      await makeWatcher(paymentStore.store, chain, orders, notify).runOnce();

      expect(notified).toEqual([]);
      expect(paymentStore.getProgress()?.underpaid).toBe(false);
    });

    it('still demands a balance when the customer is short even counting the mempool', async () => {
      const intent = makeIntent({ expectedSats: 100000 });
      const paymentStore = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 20000,
        pendingSats: 5000,
        confirmations: 1,
      });
      const { repo: orders } = makeFakeOrders('awaiting_payment');
      const { notify, notified } = makeNotifyUnderpaid();

      await makeWatcher(paymentStore.store, chain, orders, notify).runOnce();

      expect(notified).toEqual([intent.orderId]);
      expect(paymentStore.getProgress()?.underpaid).toBe(true);
    });

    it('does not settle an order whose confirmed part alone is short', async () => {
      // The gate that stops `underpaid` counting pending value from becoming a
      // way to pay with mempool money: 50k confirmed and 50k pending is not
      // underpaid, but only 50k is actually safe, so it must not settle —
      // however deep the confirmed half is.
      const { repo, getStatus } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store, wasConfirmed } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 50000,
        pendingSats: 50000,
        confirmations: REQUIRED_CONFIRMATIONS,
      });

      await makeWatcher(store, chain, repo).runOnce();

      expect(wasConfirmed()).toBe(false);
      expect(getStatus()).toBe('awaiting_confirmation');
    });

    it('settles once the pending part confirms', async () => {
      const { repo, getStatus } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store, wasConfirmed } = makeFakePaymentStore(intent);

      await makeWatcher(
        store,
        makeFakeChain({
          address: intent.address,
          confirmedSats: 50000,
          pendingSats: 50000,
          confirmations: REQUIRED_CONFIRMATIONS,
        }),
        repo,
      ).runOnce();
      expect(wasConfirmed()).toBe(false);

      await makeWatcher(
        store,
        makeFakeChain({
          address: intent.address,
          confirmedSats: 100000,
          pendingSats: 0,
          confirmations: REQUIRED_CONFIRMATIONS,
        }),
        repo,
      ).runOnce();

      expect(getStatus()).toBe('paid');
      expect(wasConfirmed()).toBe(true);
    });

    it('records what is pending so the customer can be shown it', async () => {
      const { repo } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store, getProgress } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 0,
        pendingSats: 100000,
        confirmations: 0,
      });

      await makeWatcher(store, chain, repo).runOnce();

      expect(getProgress()).toEqual({
        confirmations: 0,
        confirmedSats: 0,
        pendingSats: 100000,
        underpaid: false,
        overpaid: false,
      });
    });

    it('is not counted toward overpayment, which is a settled fact', async () => {
      const { repo } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store, getProgress } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 100000,
        pendingSats: 50000,
        confirmations: REQUIRED_CONFIRMATIONS,
      });

      await makeWatcher(store, chain, repo).runOnce();

      expect(getProgress()?.overpaid).toBe(false);
    });
  });

  describe('dust sent to a known address', () => {
    /**
     * The address is public the instant the customer pays, and it is in the
     * BIP21 QR before that. `awaiting_confirmation` is a one-way door — no
     * cancel, no re-quote, out of reach of benign expiry — and it starts the
     * 48-hour clock that ends in terminal `failed`.
     *
     * So a bare `seenSats > 0` meant 546 unconfirmed satoshis could push
     * anyone's order into that door and hold it there. The dust tolerance the
     * amount comparisons already used has to apply to "is this a payment at
     * all", not just to "is it the right size".
     */
    it('does not move an order on a dust-sized amount', async () => {
      const { repo, getStatus } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 0,
        pendingSats: 546,
        confirmations: 0,
      });

      await makeWatcher(store, chain, repo).runOnce();

      // Still cancellable, still re-quotable, still expirable normally.
      expect(getStatus()).toBe('awaiting_payment');
    });

    it('does not email a balance demand on dust', async () => {
      const intent = makeIntent({ expectedSats: 100000 });
      const paymentStore = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 546,
        pendingSats: 0,
        confirmations: 1,
      });
      const { repo: orders } = makeFakeOrders('awaiting_payment');
      const { notify, notified } = makeNotifyUnderpaid();

      await makeWatcher(paymentStore.store, chain, orders, notify).runOnce();

      expect(notified).toEqual([]);
    });

    it('still records what was seen, so it is not invisible', async () => {
      // Refusing to act on it is not the same as pretending it isn't there —
      // the admin panel reads these figures.
      const { repo } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store, getProgress } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 546,
        pendingSats: 0,
        confirmations: 1,
      });

      await makeWatcher(store, chain, repo).runOnce();

      expect(getProgress()?.confirmedSats).toBe(546);
    });

    it('acts on a real part-payment that happens to be small', async () => {
      // The floor is the dust tolerance, not an arbitrary "small" — anything
      // above it is a genuine payment and must be treated as one.
      const { repo, getStatus } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 5000,
        pendingSats: 0,
        confirmations: 1,
      });

      await makeWatcher(store, chain, repo).runOnce();

      expect(getStatus()).toBe('awaiting_confirmation');
    });

    it('settles normally when dust arrives alongside the real payment', async () => {
      const { repo, getStatus } = makeFakeOrders('awaiting_payment');
      const intent = makeIntent({ expectedSats: 100000 });
      const { store } = makeFakePaymentStore(intent);
      const chain = makeFakeChain({
        address: intent.address,
        confirmedSats: 100546,
        pendingSats: 0,
        confirmations: REQUIRED_CONFIRMATIONS,
      });

      await makeWatcher(store, chain, repo).runOnce();

      expect(getStatus()).toBe('paid');
    });
  });
});
