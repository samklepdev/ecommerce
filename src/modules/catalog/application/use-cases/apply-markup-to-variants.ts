import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface ApplyMarkupToVariantsInput {
  variantIds: string[];
  markupPercent: number;
}

export interface ApplyMarkupToVariantsResult {
  updated: number;
  failed: number;
}

/** Bulk price adjustment — compounds on each variant's CURRENT sell price
 * (not recomputed from supplier cost), so it never clobbers a manual
 * pricing decision layered on top. Same per-item try/catch + counters
 * shape as `PublishProducts`/`DeleteProducts`. */
export class ApplyMarkupToVariants implements UseCase<ApplyMarkupToVariantsInput, ApplyMarkupToVariantsResult> {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: ApplyMarkupToVariantsInput): Promise<ApplyMarkupToVariantsResult> {
    let updated = 0;
    let failed = 0;

    for (const variantId of input.variantIds) {
      try {
        const variant = await this.products.findVariantById(variantId);
        if (!variant) {
          failed += 1;
          logger.warn('apply markup: variant not found', { variantId });
          continue;
        }

        const amountMinor = Math.round(variant.price.amountMinor * (1 + input.markupPercent / 100));
        await this.products.updateVariantPrice(variantId, amountMinor, variant.price.currency);
        updated += 1;
      } catch (e) {
        failed += 1;
        logger.warn('apply markup: failed to update variant', {
          variantId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { updated, failed };
  }
}
