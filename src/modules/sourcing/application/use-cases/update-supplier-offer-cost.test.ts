import { describe, expect, it } from 'vitest';

import { UpdateSupplierOfferCost } from './update-supplier-offer-cost';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

function makeFakeOffers() {
  const updated: { offerId: string; amountMinor: number; currency: string }[] = [];
  const repo: Partial<SupplierOfferRepository> = {
    async updateCost(offerId, amountMinor, currency) {
      updated.push({ offerId, amountMinor, currency });
    },
  };
  return { repo: repo as SupplierOfferRepository, updated };
}

describe('UpdateSupplierOfferCost', () => {
  it('updates the offer cost with the given amount and currency', async () => {
    const { repo, updated } = makeFakeOffers();

    await new UpdateSupplierOfferCost(repo).execute({ offerId: 'offer-1', amountMinor: 899, currency: 'USD' });

    expect(updated).toEqual([{ offerId: 'offer-1', amountMinor: 899, currency: 'USD' }]);
  });

  it('throws on a non-integer amount rather than persisting it', async () => {
    const { repo, updated } = makeFakeOffers();

    await expect(
      new UpdateSupplierOfferCost(repo).execute({ offerId: 'offer-1', amountMinor: 8.99, currency: 'USD' }),
    ).rejects.toThrow('integer minor-unit value');
    expect(updated).toHaveLength(0);
  });

  it('throws on an invalid currency code rather than persisting it', async () => {
    const { repo, updated } = makeFakeOffers();

    await expect(
      new UpdateSupplierOfferCost(repo).execute({ offerId: 'offer-1', amountMinor: 899, currency: 'US' }),
    ).rejects.toThrow('3-letter ISO 4217 code');
    expect(updated).toHaveLength(0);
  });
});
