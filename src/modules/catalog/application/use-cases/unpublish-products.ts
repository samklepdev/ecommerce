import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface UnpublishProductsInput {
  productIds: string[];
}

export interface UnpublishProductsResult {
  unpublished: number;
  failed: number;
}

/** Moves active products back to `draft`, hiding them from the storefront
 * (`ProductRepository.list()` only returns `active`). Each product is
 * updated independently so one failure doesn't block the rest of a bulk
 * selection. */
export class UnpublishProducts implements UseCase<UnpublishProductsInput, UnpublishProductsResult> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: UnpublishProductsInput): Promise<UnpublishProductsResult> {
    let unpublished = 0;
    let failed = 0;

    for (const productId of input.productIds) {
      try {
        await this.products.updateStatus(productId, 'draft');
        unpublished += 1;
      } catch (e) {
        failed += 1;
        logger.warn('failed to unpublish product', {
          productId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { unpublished, failed };
  }
}
