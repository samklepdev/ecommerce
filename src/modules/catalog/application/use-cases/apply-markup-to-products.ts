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
        // findAnyById, not findById: this is an admin bulk action over a
        // selection made in the admin table, which lists drafts and archived
        // products too. Repricing one must not silently skip them.
        const product = await this.products.findAnyById(productId);
        if (!product) {
          failed += 1;
          logger.warn('apply markup: product not found', { productId });
          continue;
        }

        const amountMinor = Math.round(product.price.amountMinor * (1 + input.markupPercent / 100));

        // Guarded on the *result*, not the input percentage: `-99` looks
        // survivable but rounds a 20-minor-unit price to 0, and `-100` zeroes
        // everything. A zero or negative price is not a discount — it's a free
        // or nonsensical product that would go on to quote zero or negative
        // satoshis, which no wallet can pay. Counted as failed and skipped, so
        // one bad percentage can't silently empty a catalogue's pricing.
        if (amountMinor <= 0) {
          failed += 1;
          logger.warn('apply markup: refused, price would not be sellable', {
            productId,
            markupPercent: input.markupPercent,
            wouldBe: amountMinor,
          });
          continue;
        }

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
