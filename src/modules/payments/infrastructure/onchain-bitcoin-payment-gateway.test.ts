import { describe, expect, it } from 'vitest';
import { networks } from 'bitcoinjs-lib';

import { OnChainBitcoinPaymentGateway } from './onchain-bitcoin-payment-gateway';
import { HdAddressDeriver } from './bitcoin/address-deriver';
import { Money } from '@/shared/domain/money';
import type {
  AddressIndexAllocator,
  BitcoinPaymentIntent,
  BitcoinPaymentStore,
  BtcRateProvider,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';

/** An address nobody has sent anything to — what every pre-existing test in
 * this file assumes, and the only state in which repricing is allowed. */
function makeEmptyChain(): ChainDataProvider {
  return {
    async getStatus(address) {
      return { address, confirmedSats: 0, pendingSats: 0, confirmations: 0 };
    },
  };
}

// A real (but throwaway, randomly generated) testnet account xpub — no
// funds, no relation to any real wallet. Deriving addresses needs a
// checksum-valid base58check key, not just a plausible-looking string.
const TEST_XPUB =
  'tpubDDTyJEgNqk6uZKJ6vdM1HdNytMarfrTJBkQH1MGSiYrCnPrkXr1642ndLRb1FbDYBRbHzrq25w2MsGrRrEZziNj1v3BQcmxjYqAMc4iaVQ6';

function makeFakeAllocator(startAt = 0): AddressIndexAllocator {
  let next = startAt;
  return {
    async next() {
      return next++;
    },
    async seedFloor() {},
  };
}

/** Behaves like the real Redis allocator, including being raisable — so a
 * test can show a wiped counter recovering rather than reusing an index. */
function makeSeedableAllocator(startAt = 0) {
  let next = startAt;
  const seeded: number[] = [];
  const allocator: AddressIndexAllocator = {
    async next() {
      return next++;
    },
    async seedFloor(minNextIndex) {
      seeded.push(minNextIndex);
      if (minNextIndex > next) next = minNextIndex;
    },
  };
  return { allocator, seeded };
}

function makeFakeRates(satsPerFiatUnit = 1000): BtcRateProvider {
  return {
    async satsPerFiatUnit() {
      return satsPerFiatUnit;
    },
  };
}

/** Simulates the race: `save()` no-ops (another request already won and
 * persisted its own intent first), but `getByOrderId` returns whatever is
 * actually in the store — the winner's row, seeded independently of what
 * this gateway instance computed. */
function makeFakeStoreThatLosesTheRace(winningIntent: BitcoinPaymentIntent): BitcoinPaymentStore {
  return {
    async save() {
      // no-op: another request's row already won the unique constraint
    },
    async getByOrderId() {
      return winningIntent;
    },
    async listWatchable() {
      return [];
    },
    async highestAddressIndex() {
    return null;
  },
  async markConfirmed() {},
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
    async recordProgress() {},
  };
}

function makeFakeStoreEmpty(): { store: BitcoinPaymentStore; saved: BitcoinPaymentIntent[] } {
  const saved: BitcoinPaymentIntent[] = [];
  const store: BitcoinPaymentStore = {
    async save(intent) {
      saved.push(intent);
    },
    async getByOrderId() {
      return saved[0] ?? null;
    },
    async highestAddressIndex() {
      return saved.length > 0 ? Math.max(...saved.map((i) => i.addressIndex)) : null;
    },
    async listWatchable() {
      return [];
    },
    async markConfirmed() {},
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
    async recordProgress() {},
  };
  return { store, saved };
}

describe('OnChainBitcoinPaymentGateway.createPayment', () => {
  it('returns the persisted (winning) intent, not its own locally-derived one, when it loses a creation race', async () => {
    const deriver = new HdAddressDeriver(TEST_XPUB, networks.testnet);
    const winningIntent: BitcoinPaymentIntent = {
      orderId: 'order-1',
      address: 'tb1qwinner00000000000000000000000000000000',
      addressIndex: 999,
      expectedSats: 123456,
      fiatCurrency: 'USD',
      satsPerFiatUnit: 1000,
      expiresAt: new Date(Date.now() + 900_000),
      status: 'awaiting',
    };
    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      makeFakeAllocator(0),
      makeFakeRates(),
      makeFakeStoreThatLosesTheRace(winningIntent),
      makeEmptyChain(),
      900,
    );

    const result = await gateway.createPayment({
      orderId: 'order-1',
      amount: Money.of(5000, 'USD'),
      idempotencyKey: 'order-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reference).toBe(winningIntent.address);
      expect(result.value.expectedSats).toBe(winningIntent.expectedSats);
      expect(result.value.bip21Uri).toContain(winningIntent.address);
    }
  });

  it('returns the freshly-created intent on the normal (non-racing) path', async () => {
    const deriver = new HdAddressDeriver(TEST_XPUB, networks.testnet);
    const { store, saved } = makeFakeStoreEmpty();
    const gateway = new OnChainBitcoinPaymentGateway(deriver, makeFakeAllocator(0), makeFakeRates(1000), store, makeEmptyChain(), 900);

    const result = await gateway.createPayment({
      orderId: 'order-1',
      amount: Money.of(5000, 'USD'),
      idempotencyKey: 'order-1',
    });

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
    if (result.ok) {
      expect(result.value.reference).toBe(saved[0]?.address);
      expect(result.value.expectedSats).toBe(saved[0]?.expectedSats);
    }
  });
});


describe('OnChainBitcoinPaymentGateway address-index floor', () => {
  const deriver = new HdAddressDeriver(TEST_XPUB, networks.testnet);

  // The scenario: Redis lost the counter (evicted, wiped, new instance), so
  // it restarts at 0 — but the database still knows index 41 was handed out.
  // Allocating 0 again would re-derive an address a previous order used.
  it('raises a reset counter above the highest index the database has seen', async () => {
    const { allocator, seeded } = makeSeedableAllocator(0);
    const { store, saved } = makeFakeStoreEmpty();
    store.highestAddressIndex = async () => 41;

    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      allocator,
      makeFakeRates(),
      store,
      makeEmptyChain(),
      900,
    );

    const result = await gateway.createPayment({
      orderId: 'order-1',
      amount: Money.of(5000, 'USD'),
      idempotencyKey: 'order-1',
    });

    expect(result.ok).toBe(true);
    expect(seeded).toEqual([42]);
    expect(saved[0]?.addressIndex).toBe(42);
  });

  it('seeds once per process, not on every checkout', async () => {
    const { allocator, seeded } = makeSeedableAllocator(0);
    const { store } = makeFakeStoreEmpty();
    let highestCalls = 0;
    store.highestAddressIndex = async () => {
      highestCalls += 1;
      return 5;
    };
    store.getByOrderId = async () => null; // never idempotency-short-circuit

    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      allocator,
      makeFakeRates(),
      store,
      makeEmptyChain(),
      900,
    );
    const pay = (id: string) =>
      gateway.createPayment({ orderId: id, amount: Money.of(5000, 'USD'), idempotencyKey: id });

    await pay('order-1');
    await pay('order-2');

    expect(highestCalls).toBe(1);
    expect(seeded).toEqual([6]);
  });

  // Refusing every checkout because a bookkeeping query failed would be the
  // worse outcome; the unique constraint on `address` is the real backstop.
  it('still allocates if the high-water query fails', async () => {
    const { allocator } = makeSeedableAllocator(0);
    const { store } = makeFakeStoreEmpty();
    store.highestAddressIndex = async () => {
      throw new Error('db down');
    };

    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      allocator,
      makeFakeRates(),
      store,
      makeEmptyChain(),
      900,
    );

    const result = await gateway.createPayment({
      orderId: 'order-1',
      amount: Money.of(5000, 'USD'),
      idempotencyKey: 'order-1',
    });

    expect(result.ok).toBe(true);
  });
});

describe('OnChainBitcoinPaymentGateway.repricePayment', () => {
  const deriver = new HdAddressDeriver(TEST_XPUB, networks.testnet);
  const ADDRESS = 'tb1qexisting000000000000000000000000000000';

  /** A store holding one awaiting intent, recording what it was repriced to. */
  function makeStoreWithAwaitingIntent() {
    const intent: BitcoinPaymentIntent = {
      orderId: 'order-1',
      address: ADDRESS,
      addressIndex: 7,
      expectedSats: 100_000,
      fiatCurrency: 'USD',
      satsPerFiatUnit: 1000,
      expiresAt: new Date(Date.now() + 900_000),
      status: 'awaiting',
    };
    const repriced: { expectedSats: number }[] = [];
    const { store } = makeFakeStoreEmpty();
    store.getByOrderId = async () => intent;
    store.reprice = async (_orderId, quote) => {
      repriced.push({ expectedSats: quote.expectedSats });
      intent.expectedSats = quote.expectedSats;
      intent.expiresAt = quote.expiresAt;
    };
    return { store, repriced };
  }

  function makeChain(confirmedSats: number, pendingSats: number): ChainDataProvider {
    return {
      async getStatus(address) {
        return { address, confirmedSats, pendingSats, confirmations: 0 };
      },
    };
  }

  it('refuses to restate the amount while a payment sits in the mempool', async () => {
    // The defect three separate audit passes ranked first. Only confirmed
    // value moved the order's status, so a customer who broadcast at minute 14
    // was still `awaiting_payment` at minute 15 — when the widget declared the
    // quote lapsed and offered "get today's price". Taking it repriced the
    // payment already in flight: if BTC had fallen, their full payment became
    // an underpayment, they were emailed a demand for a balance they did not
    // owe, and at 48 hours the order went terminal with their money on it.
    const { store, repriced } = makeStoreWithAwaitingIntent();
    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      makeFakeAllocator(0),
      makeFakeRates(1200), // rate moved since the original quote
      store,
      makeChain(0, 100_000),
      900,
    );

    const result = await gateway.repricePayment({
      orderId: 'order-1',
      amount: Money.of(10_000, 'USD'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('payment_in_flight');
    // The critical assertion: the amount owed did not move.
    expect(repriced).toEqual([]);
  });

  it('refuses when the address already holds confirmed value', async () => {
    const { store, repriced } = makeStoreWithAwaitingIntent();
    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      makeFakeAllocator(0),
      makeFakeRates(1200),
      store,
      makeChain(100_000, 0),
      900,
    );

    const result = await gateway.repricePayment({
      orderId: 'order-1',
      amount: Money.of(10_000, 'USD'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('payment_in_flight');
    expect(repriced).toEqual([]);
  });

  it('reprices despite dust, which anyone can send to a public address', async () => {
    // The mirror of the watcher's dust floor. Refusing on any value at all let
    // a stranger permanently block a customer's re-quote for 546 satoshis —
    // and the lapsed-quote panel would then tell that customer "we can see
    // your payment" when they had sent nothing.
    const { store, repriced } = makeStoreWithAwaitingIntent();
    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      makeFakeAllocator(0),
      makeFakeRates(1200),
      store,
      makeChain(0, 546),
      900,
    );

    const result = await gateway.repricePayment({
      orderId: 'order-1',
      amount: Money.of(10_000, 'USD'),
    });

    expect(result.ok).toBe(true);
    expect(repriced).toEqual([{ expectedSats: 120_000 }]);
  });

  it('still refuses once the amount is past dust', async () => {
    const { store, repriced } = makeStoreWithAwaitingIntent();
    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      makeFakeAllocator(0),
      makeFakeRates(1200),
      store,
      makeChain(0, 5_000),
      900,
    );

    const result = await gateway.repricePayment({
      orderId: 'order-1',
      amount: Money.of(10_000, 'USD'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('payment_in_flight');
    expect(repriced).toEqual([]);
  });

  it('reprices normally when nothing has been sent to the address', async () => {
    const { store, repriced } = makeStoreWithAwaitingIntent();
    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      makeFakeAllocator(0),
      makeFakeRates(1200),
      store,
      makeEmptyChain(),
      900,
    );

    const result = await gateway.repricePayment({
      orderId: 'order-1',
      amount: Money.of(10_000, 'USD'),
    });

    expect(result.ok).toBe(true);
    // $100 at 1,200 sats/USD.
    expect(repriced).toEqual([{ expectedSats: 120_000 }]);
  });

  it('fails closed when the chain cannot be read, rather than repricing blind', async () => {
    // Repricing without knowing whether money is on its way is precisely the
    // thing that loses it. An Esplora outage costs the customer a re-quote;
    // guessing costs them the payment.
    const { store, repriced } = makeStoreWithAwaitingIntent();
    const brokenChain: ChainDataProvider = {
      async getStatus() {
        throw new Error('esplora unavailable');
      },
    };
    const gateway = new OnChainBitcoinPaymentGateway(
      deriver,
      makeFakeAllocator(0),
      makeFakeRates(1200),
      store,
      brokenChain,
      900,
    );

    const result = await gateway.repricePayment({
      orderId: 'order-1',
      amount: Money.of(10_000, 'USD'),
    });

    expect(result.ok).toBe(false);
    expect(repriced).toEqual([]);
  });
});
