import { describe, expect, it } from 'vitest';

import { SetShippingRate } from './set-shipping-rate';
import { Money } from '@/shared/domain/money';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';

function makeFakeRepo() {
  const saved: Money[] = [];
  const repo: ShippingRateRepository = {
    async get() {
      return saved[saved.length - 1] ?? Money.zero('USD');
    },
    async set(rate) {
      saved.push(rate);
    },
  };
  return { repo, saved };
}

describe('SetShippingRate', () => {
  it('saves a valid rate', async () => {
    const { repo, saved } = makeFakeRepo();
    await new SetShippingRate(repo).execute({ amountMinor: 599, currency: 'USD' });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.amountMinor).toBe(599);
    expect(saved[0]?.currency).toBe('USD');
  });

  it('accepts zero as a valid rate (free shipping)', async () => {
    const { repo, saved } = makeFakeRepo();
    await new SetShippingRate(repo).execute({ amountMinor: 0, currency: 'USD' });
    expect(saved[0]?.amountMinor).toBe(0);
  });

  it('rejects a non-integer amount', async () => {
    const { repo, saved } = makeFakeRepo();
    await expect(
      new SetShippingRate(repo).execute({ amountMinor: 1.5, currency: 'USD' }),
    ).rejects.toThrow();
    expect(saved).toHaveLength(0);
  });
});
