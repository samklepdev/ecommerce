import type { UseCase } from '@/shared/application/use-case';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface ListProductsInput {
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface ListProductsResult {
  items: Product[];
  total: number;
}

export class ListProducts implements UseCase<ListProductsInput, ListProductsResult> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: ListProductsInput): Promise<ListProductsResult> {
    const [items, total] = await Promise.all([
      this.products.list(input),
      this.products.count({ search: input.search, category: input.category }),
    ]);
    return { items, total };
  }
}
