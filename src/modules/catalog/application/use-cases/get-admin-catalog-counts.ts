import type { UseCase } from '@/shared/application/use-case';
import type {
  AdminCatalogCounts,
  ProductRepository,
} from '@/modules/catalog/application/ports/product-repository';

/** Catalog size and how much of it is live. One query, for a header line
 * that used to be derived by counting a full in-memory product list. */
export class GetAdminCatalogCounts implements UseCase<void, AdminCatalogCounts> {
  constructor(private readonly products: ProductRepository) {}

  async execute(): Promise<AdminCatalogCounts> {
    return this.products.getAdminCatalogCounts();
  }
}
