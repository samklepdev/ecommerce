import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface PublishProductsInput {
  productIds: string[];
}

export interface PublishProductsResult {
  published: number;
  failed: number;
}

/** Moves draft (or archived) products to `active`, making them visible on the
 * storefront. Each product is updated independently so one failure doesn't
 * block the rest of a bulk selection. */
export class PublishProducts implements UseCase<PublishProductsInput, PublishProductsResult> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: PublishProductsInput): Promise<PublishProductsResult> {
    let published = 0;
    let failed = 0;

    for (const productId of input.productIds) {
      try {
        await this.products.updateStatus(productId, 'active');
        published += 1;
      } catch (e) {
        failed += 1;
        logger.warn('failed to publish product', {
          productId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { published, failed };
  }
}
