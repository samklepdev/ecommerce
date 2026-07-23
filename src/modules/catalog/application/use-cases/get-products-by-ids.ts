import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

const MAX_IDS = 8;

export interface GetProductsByIdsInput {
  productIds: string[];
}

export class GetProductsByIds implements UseCase<GetProductsByIdsInput, Product[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: GetProductsByIdsInput): Promise<Product[]> {
    if (input.productIds.length === 0) return [];
    return this.products.findByIds(input.productIds.slice(0, MAX_IDS));
  }
}
