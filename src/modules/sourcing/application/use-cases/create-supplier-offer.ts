import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface CreateSupplierOfferInput {
  variantId: string;
  supplierId: string;
  supplierProductUrl: string;
  costAmountMinor: number;
  costCurrency: string;
  isPreferred?: boolean;
}

export class CreateSupplierOffer implements UseCase<CreateSupplierOfferInput, SupplierOffer> {
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: CreateSupplierOfferInput): Promise<SupplierOffer> {
    const offer = SupplierOffer.create({
      id: randomUUID(),
      variantId: input.variantId,
      supplierId: input.supplierId,
      supplierProductUrl: input.supplierProductUrl,
      cost: Money.of(input.costAmountMinor, input.costCurrency),
      isAvailable: true,
      isPreferred: input.isPreferred ?? false,
    });
    await this.offers.create(offer);
    return offer;
  }
}
