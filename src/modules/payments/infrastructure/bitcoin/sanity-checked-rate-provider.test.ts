import { describe, expect, it, vi } from 'vitest';

import { SanityCheckedRateProvider } from './sanity-checked-rate-provider';
import { DEFAULT_RATE_BANDS } from '@/modules/payments/domain/rate-sanity';
import type {
  BtcRateProvider,
  LastKnownRateStore,
} from '@/modules/payments/application/ports/bitcoin-ports';

const SATS_PER_BTC = 100_000_000;

/** The inner provider speaks sats-per-fiat-unit, so tests state the BTC price
 * they mean and convert once, the same way the real feed does. */
function providerAtPrice(...prices: number[]): { provider: BtcRateProvider; calls: () => number } {
  let i = 0;
  return {
    provider: {
      async satsPerFiatUnit() {
        const price = prices[Math.min(i, prices.length - 1)]!;
        i += 1;
        return SATS_PER_BTC / price;
      },
    },
    calls: () => i,
  };
}

function makeStore(initial: number | null = null) {
  let stored = initial;
  const store: LastKnownRateStore = {
    async get() {
      return stored;
    },
    async set(_currency, price) {
      stored = price;
    },
  };
  return { store, read: () => stored };
}

function priceOf(satsPerUnit: number): number {
  return SATS_PER_BTC / satsPerUnit;
}

describe('SanityCheckedRateProvider', () => {
  it('passes an ordinary rate straight through', async () => {
    const { provider } = providerAtPrice(60_000);
    const { store } = makeStore();

    const sats = await new SanityCheckedRateProvider(
      provider,
      store,
      DEFAULT_RATE_BANDS,
    ).satsPerFiatUnit('USD');

    expect(priceOf(sats)).toBeCloseTo(60_000, 6);
  });

  it('remembers an accepted price as the next reference', async () => {
    const { provider } = providerAtPrice(60_000);
    const { store, read } = makeStore();

    await new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('USD');

    expect(read()).toBeCloseTo(60_000, 6);
  });

  it('refuses to quote from a decimal-shifted price', async () => {
    // The whole point: this throws rather than returning, so `createPayment`
    // fails and the customer is told to try again — instead of being handed a
    // 50 BTC invoice, or an invoice for 50 satoshis that they pay.
    const { provider } = providerAtPrice(1);
    const { store } = makeStore();

    await expect(
      new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('USD'),
    ).rejects.toThrow(/implausible/i);
  });

  it('refuses a price that moved too far from the last accepted one', async () => {
    const { provider } = providerAtPrice(120_000);
    const { store } = makeStore(60_000);

    await expect(
      new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('USD'),
    ).rejects.toThrow(/deviat/i);
  });

  it('does not remember a rejected price', async () => {
    // Otherwise one bad reading becomes the new reference and every
    // subsequent good one looks like the deviation.
    const { provider } = providerAtPrice(120_000);
    const { store, read } = makeStore(60_000);

    await expect(
      new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('USD'),
    ).rejects.toThrow();

    expect(read()).toBe(60_000);
  });

  it('quotes normally when the store has no history', async () => {
    const { provider } = providerAtPrice(60_000);
    const { store } = makeStore(null);

    const sats = await new SanityCheckedRateProvider(
      provider,
      store,
      DEFAULT_RATE_BANDS,
    ).satsPerFiatUnit('USD');

    expect(priceOf(sats)).toBeCloseTo(60_000, 6);
  });

  it('still quotes when the store cannot be read', async () => {
    // Redis being down must not stop the shop taking money. The absolute band
    // still applies, so the catastrophic cases are still refused; only the
    // cross-check against history is lost.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { provider } = providerAtPrice(60_000);
    const store: LastKnownRateStore = {
      async get() {
        throw new Error('redis down');
      },
      async set() {},
    };

    const sats = await new SanityCheckedRateProvider(
      provider,
      store,
      DEFAULT_RATE_BANDS,
    ).satsPerFiatUnit('USD');

    expect(priceOf(sats)).toBeCloseTo(60_000, 6);
    warn.mockRestore();
  });

  it('still refuses an implausible price when the store cannot be read', async () => {
    const { provider } = providerAtPrice(1);
    const store: LastKnownRateStore = {
      async get() {
        throw new Error('redis down');
      },
      async set() {},
    };

    await expect(
      new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('USD'),
    ).rejects.toThrow(/implausible/i);
  });

  it('still quotes when the price cannot be remembered', async () => {
    // A failed write costs the next call its reference, not this customer
    // their checkout.
    const { provider } = providerAtPrice(60_000);
    const store: LastKnownRateStore = {
      async get() {
        return null;
      },
      async set() {
        throw new Error('redis down');
      },
    };

    const sats = await new SanityCheckedRateProvider(
      provider,
      store,
      DEFAULT_RATE_BANDS,
    ).satsPerFiatUnit('USD');

    expect(priceOf(sats)).toBeCloseTo(60_000, 6);
  });

  it('keys history per currency', async () => {
    const reads: string[] = [];
    const { provider } = providerAtPrice(60_000);
    const store: LastKnownRateStore = {
      async get(currency) {
        reads.push(currency);
        return null;
      },
      async set() {},
    };

    await new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('EUR');

    expect(reads).toEqual(['EUR']);
  });

  it('propagates a feed failure rather than inventing a rate', async () => {
    const provider: BtcRateProvider = {
      async satsPerFiatUnit() {
        throw new Error('rate feed HTTP 503');
      },
    };
    const { store } = makeStore(60_000);

    await expect(
      new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('USD'),
    ).rejects.toThrow(/503/);
  });

  it('refuses a non-finite rate rather than dividing by it', async () => {
    // `satsPerFiatUnit` of 0 or Infinity would make the price conversion
    // nonsense before any band could look at it.
    const provider: BtcRateProvider = {
      async satsPerFiatUnit() {
        return 0;
      },
    };
    const { store } = makeStore();

    await expect(
      new SanityCheckedRateProvider(provider, store, DEFAULT_RATE_BANDS).satsPerFiatUnit('USD'),
    ).rejects.toThrow();
  });
});
