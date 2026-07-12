import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface SetPreferredSupplierOfferInput {
  offerId: string;
  variantId: string;
}

/** Switches which existing offer is preferred for a variant without creating a new one. */
export class SetPreferredSupplierOffer implements UseCase<SetPreferredSupplierOfferInput, void> {
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: SetPreferredSupplierOfferInput): Promise<void> {
    await this.offers.setPreferred(input.offerId, input.variantId);
  }
}
