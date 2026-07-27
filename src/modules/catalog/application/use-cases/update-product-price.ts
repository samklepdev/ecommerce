import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface UpdateProductPriceInput {
  productId: string;
  amountMinor: number;
  currency: string;
}

/** Lets an admin mark up a product's sell price above its supplier cost —
 * imported products land with sell price defaulted to cost (0% markup, see
 * `ImportProductsFromFeed`), and this is the only way to change it after
 * creation. */
export class UpdateProductPrice implements UseCase<UpdateProductPriceInput, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: UpdateProductPriceInput): Promise<void> {
    Money.of(input.amountMinor, input.currency); // validates, throws on bad input
    await this.products.updatePrice(input.productId, input.amountMinor, input.currency);
  }
}
