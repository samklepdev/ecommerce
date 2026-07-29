import type { UseCase } from '@/shared/application/use-case';
import { Money } from '@/shared/domain/money';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface UpdateProductInput {
  productId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  amountMinor: number;
  currency: string;
}

/**
 * The admin edit panel's single save: name, description, category and price
 * in one call.
 *
 * Exists so the panel can have one Save button rather than one per field.
 * That's a UI concern on the surface, but the sequencing isn't — every
 * check runs before any write, so a rejected price can't leave a
 * half-applied edit behind. That's business logic, and it belongs here
 * rather than in the server action.
 *
 * Slug is deliberately absent: it's permanent once created, so existing
 * bookmarked product URLs never break.
 */
export class UpdateProduct implements UseCase<UpdateProductInput, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: UpdateProductInput): Promise<void> {
    if (!input.name.trim()) throw new Error('Product requires a non-empty name');
    // Validates the amount and currency, throwing before the first write.
    Money.of(input.amountMinor, input.currency);

    await this.products.updateDetails(input.productId, {
      name: input.name,
      description: input.description,
    });
    await this.products.updateCategory(input.productId, input.categoryId);
    await this.products.updatePrice(input.productId, input.amountMinor, input.currency);
  }
}
