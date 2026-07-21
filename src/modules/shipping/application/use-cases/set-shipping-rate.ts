import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import type { ShippingRateRepository } from '@/modules/shipping/application/ports/shipping-rate-repository';

export interface SetShippingRateInput {
  amountMinor: number;
  currency: string;
}

/** Zero is a valid rate (free shipping) — unlike a variant's sell price,
 * which must be positive, this only rejects malformed shape (non-integer,
 * bad currency code) via `Money.of`. Negative-amount rejection is a form
 * boundary concern, handled by the admin action, same as `UpdateVariantPrice`. */
export class SetShippingRate implements UseCase<SetShippingRateInput, void> {
  constructor(private readonly shippingRates: ShippingRateRepository) {}

  async execute(input: SetShippingRateInput): Promise<void> {
    const rate = Money.of(input.amountMinor, input.currency);
    await this.shippingRates.set(rate);
  }
}
