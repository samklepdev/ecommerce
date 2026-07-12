import type { UseCase } from '@/shared/application/use-case';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';
import type { SupplierPageFetcher } from '@/modules/sourcing/application/ports/supplier-page-fetcher';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';

export interface SyncSupplierOfferInput {
  supplierOfferId: string;
}

export type SyncSupplierOfferResult =
  | { status: 'ok' }
  | { status: 'not_found' }
  | { status: 'blocked'; message: string }
  | { status: 'error'; message: string };

/**
 * Fetches and applies a single supplier offer's current listing. Called both
 * by the manual "Sync now" admin action and the scheduled worker, so the two
 * can never drift in behavior. Never retries or alters its approach on
 * failure — a block is recorded and left for a human to look at.
 */
export class SyncSupplierOffer
  implements UseCase<SyncSupplierOfferInput, SyncSupplierOfferResult>
{
  constructor(
    private readonly offers: SupplierOfferRepository,
    private readonly fetcher: SupplierPageFetcher,
    private readonly products: ProductRepository,
  ) {}

  async execute(input: SyncSupplierOfferInput): Promise<SyncSupplierOfferResult> {
    const offer = await this.offers.findById(input.supplierOfferId);
    if (!offer) return { status: 'not_found' };

    const result = await this.fetcher.fetchListing(offer.supplierProductUrl);

    if (isErr(result)) {
      const { error } = result;
      let status: 'blocked' | 'error';
      let message: string;
      switch (error.code) {
        case 'robots_disallowed':
          status = 'blocked';
          message = 'Disallowed by robots.txt';
          break;
        case 'blocked':
          status = 'blocked';
          message = `Blocked (HTTP ${error.httpStatus})`;
          break;
        case 'parse_error':
          status = 'error';
          message = error.message;
          break;
        case 'network_error':
          status = 'error';
          message = error.message;
          break;
      }

      await this.offers.recordSyncFailure(offer.id, status, message);
      logger.warn('supplier offer sync failed', {
        supplierOfferId: offer.id,
        code: error.code,
        message,
      });
      return { status, message };
    }

    await this.offers.recordSyncSuccess(offer.id, result.value);

    if (offer.isPreferred && result.value.imageUrl) {
      const variant = await this.products.findVariantById(offer.variantId);
      if (variant) {
        await this.products.updateImageUrl(variant.productId, result.value.imageUrl);
      }
    }

    return { status: 'ok' };
  }
}
