import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface GetProductBySlugInput {
  slug: string;
}

export class GetProductBySlug implements UseCase<GetProductBySlugInput, Product | null> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: GetProductBySlugInput): Promise<Product | null> {
    return this.products.findBySlug(input.slug);
  }
}
