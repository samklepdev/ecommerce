import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface PublishProductsInput {
  productIds: string[];
}

export interface PublishProductsResult {
  published: number;
  failed: number;
  /** Refused for having nowhere to buy from — reported separately from a
   * genuine failure, because it's a fixable state, not an error. */
  unsourced: number;
}

/**
 * Moves draft (or archived) products to `active`, making them buyable.
 *
 * **A product with no supplier offer is refused.** Being sellable
 * and having somewhere to buy it from are the same fact here: this is a
 * dropship model, so an active product with no offer is one a customer can
 * pay for — irreversibly, in bitcoin — before anyone discovers there's no
 * way to fulfil it. That discovery used to happen in
 * `CreateSupplierOrdersForPaidOrder`, i.e. after the money arrived. This
 * moves it to the moment of publishing, where it costs a warning instead.
 *
 * The unfulfillable-lines queue stays as a backstop: an offer can be
 * removed or a supplier deactivated after publishing, and the money path
 * must never assume this check held.
 *
 * Each product is handled independently so one refusal doesn't block the
 * rest of a bulk selection.
 */
export class PublishProducts implements UseCase<PublishProductsInput, PublishProductsResult> {
  constructor(
    private readonly products: ProductRepository,
    private readonly offers: SupplierOfferRepository,
  ) {}

  async execute(input: PublishProductsInput): Promise<PublishProductsResult> {
    let published = 0;
    let failed = 0;
    let unsourced = 0;

    for (const productId of input.productIds) {
      try {
        const offer = await this.offers.findSourceableByProductId(productId);
        if (!offer) {
          unsourced += 1;
          logger.warn('refused to publish a product with no supplier offer', { productId });
          continue;
        }

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

    return { published, failed, unsourced };
  }
}
