import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface GetProductInput {
  productId: string;
}

export class GetProduct implements UseCase<GetProductInput, Product | null> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: GetProductInput): Promise<Product | null> {
    return this.products.findById(input.productId);
  }
}
