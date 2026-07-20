import { describe, expect, it } from 'vitest';

import { GetPaymentSessionForOrder } from './get-payment-session-for-order';
import type { BitcoinPaymentIntent, BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';

function makeFakeStore(intent: BitcoinPaymentIntent | null) {
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
    expectedSats: 157001,
    fiatCurrency: 'USD',
    satsPerFiatUnit: 1000,
    expiresAt: new Date('2026-01-01T00:15:00Z'),
    status: 'awaiting',
    ...overrides,
  };
}

describe('GetPaymentSessionForOrder', () => {
  it('surfaces expectedSats alongside the address and bip21 uri', async () => {
    const store = makeFakeStore(makeIntent());

    const session = await new GetPaymentSessionForOrder(store).execute({ orderId: 'order-1' });

    expect(session).not.toBeNull();
    expect(session?.expectedSats).toBe(157001);
    expect(session?.address).toBe('bc1qtest');
    expect(session?.bip21Uri).toContain('bc1qtest');
  });

  it('returns null when there is no payment intent for the order', async () => {
    const store = makeFakeStore(null);

    const session = await new GetPaymentSessionForOrder(store).execute({ orderId: 'missing' });

    expect(session).toBeNull();
  });
});
