import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface ListSupplierOffersForVariantInput {
  variantId: string;
}

export class ListSupplierOffersForVariant
  implements UseCase<ListSupplierOffersForVariantInput, SupplierOffer[]>
{
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: ListSupplierOffersForVariantInput): Promise<SupplierOffer[]> {
    return this.offers.listByVariantId(input.variantId);
  }
}
