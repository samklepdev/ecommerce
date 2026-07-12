import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface ListProductsInput {
  limit?: number;
  offset?: number;
}

export class ListProducts implements UseCase<ListProductsInput, Product[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: ListProductsInput): Promise<Product[]> {
    return this.products.list(input);
  }
}
