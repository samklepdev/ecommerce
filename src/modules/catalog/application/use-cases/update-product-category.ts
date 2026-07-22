import type { UseCase } from '@/shared/application/use-case';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface UpdateProductCategoryInput {
  productId: string;
  category: string | null;
}

/** Mirrors `UpdateVariantPrice`'s thin validate-and-delegate shape. */
export class UpdateProductCategory implements UseCase<UpdateProductCategoryInput, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: UpdateProductCategoryInput): Promise<void> {
    await this.products.updateCategory(input.productId, input.category);
  }
}
