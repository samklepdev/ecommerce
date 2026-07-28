import type { UseCase } from '@/shared/application/use-case';
import { fetchPage, type PageRequest, type PageResult } from '@/shared/application/page';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface ListAllProductsForAdminInput extends PageRequest {
  /** Only products with an offer from this supplier. Applied in SQL — the
   * page used to filter in memory, which meant loading the whole catalog
   * and one offers query per product to do it. */
  supplierId?: string;
}

export class ListAllProductsForAdmin
  implements UseCase<ListAllProductsForAdminInput, PageResult<Product>>
{
  constructor(private readonly products: ProductRepository) {}

  async execute(input: ListAllProductsForAdminInput): Promise<PageResult<Product>> {
    const filter = { supplierId: input.supplierId };
    return fetchPage(
      input,
      () => this.products.countAllForAdmin(filter),
      (limit, offset) => this.products.listAllForAdmin(filter, limit, offset),
    );
  }
}
