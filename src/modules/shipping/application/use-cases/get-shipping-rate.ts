import type { UseCase } from '@/shared/application/use-case';
import type { Money } from '@/shared/domain/money';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';

export class GetShippingRate implements UseCase<void, Money> {
  constructor(private readonly shippingRates: ShippingRateRepository) {}

  async execute(): Promise<Money> {
    return this.shippingRates.get();
  }
}
