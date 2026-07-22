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
} from '@/modules/payments/application/ports/bitcoin-ports';

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
    async markConfirmed() {},
    async markExpired() {},
    async markCancelled() {},
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
    async listWatchable() {
      return [];
    },
    async markConfirmed() {},
    async markExpired() {},
    async markCancelled() {},
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
    const gateway = new OnChainBitcoinPaymentGateway(deriver, makeFakeAllocator(0), makeFakeRates(1000), store, 900);

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
