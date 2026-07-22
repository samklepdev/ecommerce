import type { UseCase } from '@/shared/application/use-case';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export class ListProductCategories implements UseCase<void, string[]> {
  constructor(private readonly products: ProductRepository) {}

  async execute(): Promise<string[]> {
    return this.products.listCategories();
  }
}
