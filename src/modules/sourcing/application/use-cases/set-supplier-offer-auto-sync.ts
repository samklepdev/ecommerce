import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface SetSupplierOfferAutoSyncInput {
  offerId: string;
  enabled: boolean;
}

export class SetSupplierOfferAutoSync implements UseCase<SetSupplierOfferAutoSyncInput, void> {
  constructor(private readonly offers: SupplierOfferRepository) {}

  async execute(input: SetSupplierOfferAutoSyncInput): Promise<void> {
    await this.offers.setAutoSyncEnabled(input.offerId, input.enabled);
  }
}
