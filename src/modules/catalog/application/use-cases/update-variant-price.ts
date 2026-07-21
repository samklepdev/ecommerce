import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface UpdateVariantPriceInput {
  variantId: string;
  amountMinor: number;
  currency: string;
}

/** Lets an admin mark up a variant's sell price above its supplier cost —
 * imported products land with sell price defaulted to cost (0% markup, see
 * `ImportProductsFromFeed`), and this is the only way to change it after
 * creation. */
export class UpdateVariantPrice implements UseCase<UpdateVariantPriceInput, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: UpdateVariantPriceInput): Promise<void> {
    Money.of(input.amountMinor, input.currency); // validates, throws on bad input
    await this.products.updateVariantPrice(input.variantId, input.amountMinor, input.currency);
  }
}
