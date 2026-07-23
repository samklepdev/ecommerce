import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface GetProductForVariantInput {
  variantId: string;
}

export class GetProductForVariant implements UseCase<GetProductForVariantInput, Product | null> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: GetProductForVariantInput): Promise<Product | null> {
    return this.products.findProductByVariantId(input.variantId);
  }
}
