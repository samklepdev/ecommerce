import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface CreateSupplierOfferInput {
  productId: string;
  supplierId: string;
  supplierProductUrl: string;
  costAmountMinor: number;
  costCurrency: string;
  isAvailable?: boolean;
}

export class CreateSupplierOffer implements UseCase<CreateSupplierOfferInput, SupplierOffer> {
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: CreateSupplierOfferInput): Promise<SupplierOffer> {
    const existingPreferred = await this.offers.findPreferredByProductId(input.productId);

    const offer = SupplierOffer.create({
      id: randomUUID(),
      productId: input.productId,
      supplierId: input.supplierId,
      supplierProductUrl: input.supplierProductUrl,
      cost: Money.of(input.costAmountMinor, input.costCurrency),
      isAvailable: input.isAvailable ?? true,
      isPreferred: existingPreferred === null,
    });
    await this.offers.create(offer);
    return offer;
  }
}
