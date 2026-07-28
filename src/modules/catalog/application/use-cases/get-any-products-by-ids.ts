import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface GetAnyProductsByIdsInput {
  productIds: string[];
}

/** Admin-side batch lookup, any status. `GetProductsByIds` is the
 * customer-facing one and is active-only; an admin screen listing reviews
 * still has to name the product even if it has since been archived. */
export class GetAnyProductsByIds implements UseCase<GetAnyProductsByIdsInput, Product[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: GetAnyProductsByIdsInput): Promise<Product[]> {
    return this.products.findAnyByIds(input.productIds);
  }
}
