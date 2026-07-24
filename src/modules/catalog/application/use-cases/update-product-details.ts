import type { UseCase } from '@/shared/application/use-case';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface UpdateProductDetailsInput {
  productId: string;
  name: string;
  description: string | null;
}

/** Mirrors `UpdateProductCategory`'s thin validate-and-delegate shape — the
 * non-empty-name invariant is enforced by the action layer's Zod schema,
 * same convention as the rest of the admin catalog actions. */
export class UpdateProductDetails implements UseCase<UpdateProductDetailsInput, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: UpdateProductDetailsInput): Promise<void> {
    await this.products.updateDetails(input.productId, {
      name: input.name,
      description: input.description,
    });
  }
}
