import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface DeleteProductsInput {
  productIds: string[];
}

export interface DeleteProductsResult {
  deleted: number;
  failed: number;
}

/** Deletes each product independently so one failure (e.g. a product whose
 * product was actually ordered — the DB restricts that) doesn't block the
 * rest of a bulk selection. */
export class DeleteProducts implements UseCase<DeleteProductsInput, DeleteProductsResult> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: DeleteProductsInput): Promise<DeleteProductsResult> {
    let deleted = 0;
    let failed = 0;

    for (const productId of input.productIds) {
      try {
        await this.products.deleteProduct(productId);
        deleted += 1;
      } catch (e) {
        failed += 1;
        logger.warn('failed to delete product', {
          productId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { deleted, failed };
  }
}
