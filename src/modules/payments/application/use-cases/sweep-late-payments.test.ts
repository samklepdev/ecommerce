import { describe, expect, it, vi } from 'vitest';

import { SweepLatePayments } from './sweep-late-payments';
import type {
  AddressChainStatus,
  BitcoinPaymentIntent,
  BitcoinPaymentStore,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';
import { logger } from '@/shared/infrastructure/logger';

function intent(overrides: Partial<BitcoinPaymentIntent> = {}): BitcoinPaymentIntent {
  return {
    orderId: 'order-1',
    address: 'bc1qexpired',
    addressIndex: 7,
    expectedSats: 100_000,
    fiatCurrency: 'USD',
    satsPerFiatUnit: 1_000,
    expiresAt: new Date('2026-07-01T00:00:00Z'),
    status: 'expired',
    ...overrides,
  };
}

function makeFakeStore(intents: BitcoinPaymentIntent[]) {
  const flagged: { orderId: string; sats: number }[] = [];
  const highest = new Map<string, number>();
  const sweptSince: Date[] = [];
  const store: Partial<BitcoinPaymentStore> = {
    async listSweepable(createdSince) {
      sweptSince.push(createdSince);
      return intents;
    },
    // Mirrors the real grow-only rule so the "stay quiet when unchanged"
    // behaviour is actually under test rather than assumed.
    async recordLatePayment(orderId, sats) {
      const seen = highest.get(orderId);
      if (seen !== undefined && seen >= sats) return false;
      highest.set(orderId, sats);
      flagged.push({ orderId, sats });
      return true;
    },
  };
  return { store: store as BitcoinPaymentStore, flagged, sweptSince };
}

function makeFakeChain(byAddress: Record<string, number>, throwFor?: string) {
  const queried: string[] = [];
  const chain: ChainDataProvider = {
    async getStatus(address): Promise<AddressChainStatus> {
      queried.push(address);
      if (throwFor === address) throw new Error('esplora unavailable');
      return { address, confirmedSats: byAddress[address] ?? 0, pendingSats: 0, confirmations: 3 };
    },
  };
  return { chain, queried };
}

describe('SweepLatePayments', () => {
  it('flags an address that received money after its order closed', async () => {
    const { store, flagged } = makeFakeStore([intent()]);
    const { chain } = makeFakeChain({ bc1qexpired: 95_000 });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new SweepLatePayments(store, chain).execute();

    expect(flagged).toEqual([{ orderId: 'order-1', sats: 95_000 }]);
    // Loud on purpose: this is real money against an order nobody is expecting
    // to be paid, and it needs a human.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('late payment'),
      expect.objectContaining({ orderId: 'order-1', confirmedSats: 95_000 }),
    );
    errorSpy.mockRestore();
  });

  it('stays quiet on a re-check, but speaks up when more arrives', async () => {
    // The sweep now revisits flagged addresses hourly so a later top-up is
    // noticed. That only works if an unchanged amount is silent — otherwise the
    // same known problem is logged every hour and buries the new ones.
    const { store, flagged } = makeFakeStore([intent()]);
    const balances: Record<string, number> = { bc1qexpired: 95_000 };
    const chain: ChainDataProvider = {
      async getStatus(address) {
        return { address, confirmedSats: balances[address] ?? 0, pendingSats: 0, confirmations: 3 };
      },
    };
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const sweep = new SweepLatePayments(store, chain);

    await sweep.execute();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    await sweep.execute(); // nothing new
    expect(errorSpy).toHaveBeenCalledTimes(1);

    balances.bc1qexpired = 140_000; // the customer sent more
    await sweep.execute();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(flagged.map((f) => f.sats)).toEqual([95_000, 140_000]);

    errorSpy.mockRestore();
  });

  it('leaves an empty address alone — the overwhelmingly normal case', async () => {
    const { store, flagged } = makeFakeStore([intent()]);
    const { chain, queried } = makeFakeChain({});

    await new SweepLatePayments(store, chain).execute();

    expect(queried).toEqual(['bc1qexpired']);
    expect(flagged).toEqual([]);
  });

  it('covers cancelled intents too, not just expired ones', async () => {
    // `markCancelled` also drops an intent out of `listWatchable`, so a
    // customer who cancels and then pays anyway is invisible by the same
    // mechanism. The order state machine has a `cancelled -> paid` path that
    // nothing could otherwise reach.
    const { store, flagged } = makeFakeStore([
      intent({ orderId: 'order-2', address: 'bc1qcancelled', status: 'cancelled' }),
    ]);
    const { chain } = makeFakeChain({ bc1qcancelled: 100_000 });
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new SweepLatePayments(store, chain).execute();

    expect(flagged).toEqual([{ orderId: 'order-2', sats: 100_000 }]);
    vi.restoreAllMocks();
  });

  it('keeps going when one address lookup fails', async () => {
    // One unreachable address must not stop the rest of the sweep — the whole
    // point is that nothing gets silently skipped.
    const { store, flagged } = makeFakeStore([
      intent({ orderId: 'order-a', address: 'bc1qbroken' }),
      intent({ orderId: 'order-b', address: 'bc1qpaid' }),
    ]);
    const { chain } = makeFakeChain({ bc1qpaid: 50_000 }, 'bc1qbroken');
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new SweepLatePayments(store, chain).execute();

    expect(flagged).toEqual([{ orderId: 'order-b', sats: 50_000 }]);
    vi.restoreAllMocks();
  });

  it('bounds the sweep by age rather than scanning every address ever issued', async () => {
    const { store, sweptSince } = makeFakeStore([]);
    const { chain } = makeFakeChain({});
    const now = new Date('2026-07-31T00:00:00Z');

    await new SweepLatePayments(store, chain, () => now).execute();

    expect(sweptSince).toHaveLength(1);
    const days = (now.getTime() - sweptSince[0]!.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(90);
  });
});
