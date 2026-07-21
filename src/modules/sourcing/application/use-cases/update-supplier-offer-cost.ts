import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface UpdateSupplierOfferCostInput {
  offerId: string;
  amountMinor: number;
  currency: string;
}

/** Lets an admin correct/update what a supplier charges, independent of the
 * variant's sell price (`UpdateVariantPrice`) — the two are deliberately
 * unlinked, see `SupplierOffer`'s own doc comment. */
export class UpdateSupplierOfferCost implements UseCase<UpdateSupplierOfferCostInput, void> {
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: UpdateSupplierOfferCostInput): Promise<void> {
    Money.of(input.amountMinor, input.currency); // validates, throws on bad input
    await this.offers.updateCost(input.offerId, input.amountMinor, input.currency);
  }
}
