import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface ApplyMarkupToProductsInput {
  productIds: string[];
  markupPercent: number;
}

export interface ApplyMarkupToProductsResult {
  updated: number;
  failed: number;
}

/** Bulk price adjustment — compounds on each product's CURRENT sell price
 * (not recomputed from supplier cost), so it never clobbers a manual
 * pricing decision layered on top. Same per-item try/catch + counters
 * shape as `PublishProducts`/`DeleteProducts`. */
export class ApplyMarkupToProducts
  implements UseCase<ApplyMarkupToProductsInput, ApplyMarkupToProductsResult>
{
  constructor(private readonly products: ProductRepository) {}

  async execute(input: ApplyMarkupToProductsInput): Promise<ApplyMarkupToProductsResult> {
    let updated = 0;
    let failed = 0;

    for (const productId of input.productIds) {
      try {
        const product = await this.products.findById(productId);
        if (!product) {
          failed += 1;
          logger.warn('apply markup: product not found', { productId });
          continue;
        }

        const amountMinor = Math.round(product.price.amountMinor * (1 + input.markupPercent / 100));
        await this.products.updatePrice(productId, amountMinor, product.price.currency);
        updated += 1;
      } catch (e) {
        failed += 1;
        logger.warn('apply markup: failed to update product', {
          productId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { updated, failed };
  }
}
