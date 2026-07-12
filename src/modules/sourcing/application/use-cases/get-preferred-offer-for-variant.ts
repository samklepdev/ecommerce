import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface GetPreferredOfferForVariantInput {
  variantId: string;
}

export class GetPreferredOfferForVariant
  implements UseCase<GetPreferredOfferForVariantInput, SupplierOffer | null>
{
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: GetPreferredOfferForVariantInput): Promise<SupplierOffer | null> {
    return this.offers.findPreferredByVariantId(input.variantId);
  }
}
