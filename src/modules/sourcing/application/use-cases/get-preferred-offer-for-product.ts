import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface GetPreferredOfferForProductInput {
  productId: string;
}

export class GetPreferredOfferForProduct
  implements UseCase<GetPreferredOfferForProductInput, SupplierOffer | null>
{
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: GetPreferredOfferForProductInput): Promise<SupplierOffer | null> {
    return this.offers.findPreferredByProductId(input.productId);
  }
}
