import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface GetSourceableOfferForProductInput {
  productId: string;
}

/** The offer the storefront reads availability from — the same one
 * fulfilment would buy against, so the buy button and the money path can't
 * disagree about whether a product has a supplier. */
export class GetSourceableOfferForProduct
  implements UseCase<GetSourceableOfferForProductInput, SupplierOffer | null>
{
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: GetSourceableOfferForProductInput): Promise<SupplierOffer | null> {
    return this.offers.findSourceableByProductId(input.productId);
  }
}
