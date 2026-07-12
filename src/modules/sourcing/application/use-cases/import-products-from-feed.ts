import type { UseCase } from '@/shared/application/use-case';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { CreateProduct } from '@/modules/catalog/application/use-cases/create-product';
import type { CreateProductVariant } from '@/modules/catalog/application/use-cases/create-product-variant';
import type { SupplierFeedFetcher } from '@/modules/sourcing/application/ports/supplier-feed-fetcher';
import type { CreateSupplierOffer } from '@/modules/sourcing/application/use-cases/create-supplier-offer';

export interface ImportProductsFromFeedInput {
  supplierId: string;
  feedUrl: string;
}

export interface ImportProductsFromFeedResult {
  status: 'ok' | 'blocked' | 'error';
  message?: string;
  created: number;
  skipped: number;
}

/**
 * Bulk-imports products from a supplier's JSON feed. New products land as
 * `draft` with sell price defaulted to cost (0% markup) — invisible on the
 * storefront until an admin reviews, prices, and publishes them. Re-running
 * against the same feed is safe: any slug that already exists is skipped, not
 * overwritten (use the existing per-offer "Sync now" to refresh an
 * already-imported product's cost/availability).
 */
export class ImportProductsFromFeed
  implements UseCase<ImportProductsFromFeedInput, ImportProductsFromFeedResult>
{
  constructor(
    private readonly fetcher: SupplierFeedFetcher,
    private readonly products: ProductRepository,
    private readonly createProduct: CreateProduct,
    private readonly createProductVariant: CreateProductVariant,
    private readonly createSupplierOffer: CreateSupplierOffer,
  ) {}

  async execute(input: ImportProductsFromFeedInput): Promise<ImportProductsFromFeedResult> {
    const result = await this.fetcher.fetchListings(input.feedUrl);

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
        case 'network_error':
          status = 'error';
          message = error.message;
          break;
      }
      logger.warn('feed import failed', { feedUrl: input.feedUrl, code: error.code, message });
      return { status, message, created: 0, skipped: 0 };
    }

    let created = 0;
    let skipped = 0;

    for (const listing of result.value) {
      const existing = await this.products.findBySlug(listing.slug);
      if (existing) {
        skipped += 1;
        continue;
      }

      try {
        const product = await this.createProduct.execute({
          slug: listing.slug,
          name: listing.name,
          description: listing.description,
          status: 'draft',
        });

        if (listing.imageUrl) {
          await this.products.updateImageUrl(product.id, listing.imageUrl);
        }

        const variant = await this.createProductVariant.execute({
          productId: product.id,
          sku: listing.slug,
          name: 'Default',
          unitAmountMinor: listing.priceMinor,
          currency: listing.currency,
        });

        await this.createSupplierOffer.execute({
          variantId: variant.id,
          supplierId: input.supplierId,
          supplierProductUrl: listing.productUrl,
          costAmountMinor: listing.priceMinor,
          costCurrency: listing.currency,
          isPreferred: true,
          isAvailable: listing.available,
        });

        created += 1;
      } catch (e) {
        logger.error('feed import: failed to create product', {
          slug: listing.slug,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { status: 'ok', created, skipped };
  }
}
