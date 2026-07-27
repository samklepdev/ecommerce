import { describe, expect, it } from 'vitest';

import { CreateSupplierOffer } from './create-supplier-offer';
import { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import { Money } from '@/shared/domain/money';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

function makeFakeOffers(existingPreferred: SupplierOffer | null) {
  const created: SupplierOffer[] = [];
  const repo: Partial<SupplierOfferRepository> = {
    async create(offer) {
      created.push(offer);
    },
    async findPreferredByProductId() {
      return existingPreferred;
    },
  };
  return { repo: repo as SupplierOfferRepository, created };
}

describe('CreateSupplierOffer', () => {
  it('marks the offer preferred when the product has no existing preferred offer', async () => {
    const { repo, created } = makeFakeOffers(null);

    const offer = await new CreateSupplierOffer(repo).execute({
      productId: 'v1',
      supplierId: 's1',
      supplierProductUrl: 'https://supplier.example.com/item',
      costAmountMinor: 500,
      costCurrency: 'USD',
    });

    expect(offer.isPreferred).toBe(true);
    expect(created).toEqual([offer]);
  });

  it('does not mark the offer preferred when one already exists for the product', async () => {
    const existing = SupplierOffer.create({
      id: 'existing',
      productId: 'v1',
      supplierId: 's0',
      supplierProductUrl: 'https://supplier.example.com/existing',
      cost: Money.of(400, 'USD'),
      isAvailable: true,
      isPreferred: true,
    });
    const { repo } = makeFakeOffers(existing);

    const offer = await new CreateSupplierOffer(repo).execute({
      productId: 'v1',
      supplierId: 's1',
      supplierProductUrl: 'https://supplier.example.com/item',
      costAmountMinor: 500,
      costCurrency: 'USD',
    });

    expect(offer.isPreferred).toBe(false);
  });

  it('defaults isAvailable to true when not given', async () => {
    const { repo } = makeFakeOffers(null);

    const offer = await new CreateSupplierOffer(repo).execute({
      productId: 'v1',
      supplierId: 's1',
      supplierProductUrl: 'https://supplier.example.com/item',
      costAmountMinor: 500,
      costCurrency: 'USD',
    });

    expect(offer.isAvailable).toBe(true);
  });
});
