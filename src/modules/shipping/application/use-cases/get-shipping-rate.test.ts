import { describe, expect, it } from 'vitest';

import { GetShippingRate } from './get-shipping-rate';
import { Money } from '@/shared/domain/money';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';

function makeFakeRepo(rate: Money) {
  const repo: ShippingRateRepository = {
    async get() {
      return rate;
    },
    async set() {},
  };
  return repo;
}

describe('GetShippingRate', () => {
  it('returns whatever the repository has stored', async () => {
    const rate = Money.of(599, 'USD');
    const result = await new GetShippingRate(makeFakeRepo(rate)).execute();
    expect(result.amountMinor).toBe(599);
    expect(result.currency).toBe('USD');
  });

  it('passes through a zero rate (free shipping)', async () => {
    const rate = Money.zero('USD');
    const result = await new GetShippingRate(makeFakeRepo(rate)).execute();
    expect(result.amountMinor).toBe(0);
  });
});
