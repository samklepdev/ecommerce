import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export class ListAllProductsForAdmin implements UseCase<void, Product[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(): Promise<Product[]> {
    return this.products.listAllForAdmin();
  }
}
