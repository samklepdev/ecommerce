import type { UseCase } from '@/shared/application/use-case';
import { isErr } from '@/shared/domain/result';
import { logger } from '@/shared/infrastructure/logger';
import type { ImageStorage } from '@/shared/application/ports/image-storage';
import type { ProductRepository } from '@/modules/catalog/application/ports/product-repository';
import type { CreateProduct } from '@/modules/catalog/application/use-cases/create-product';
import type { SupplierFeedFetcher } from '@/modules/sourcing/application/ports/supplier-feed-fetcher';
import type { CreateSupplierOffer } from '@/modules/sourcing/application/use-cases/create-supplier-offer';

export type ImportProductsFromFeedInput =
  | {
      supplierId: string;
      source: 'url';
      feedUrl: string;
      /** Raw querystring (e.g. "page=2&per_page=50") merged onto feedUrl —
       * lets an admin paginate a feed without hand-editing the URL each time. */
      queryParams?: string;
    }
  | {
      supplierId: string;
      source: 'json';
      /** JSON text an admin already has in hand (e.g. an uploaded export),
       * same shape as a feed URL's response body. */
      rawJson: string;
    }
  | {
      supplierId: string;
      source: 'spreadsheet';
      /** Raw bytes of an uploaded .csv/.xlsx file. */
      fileBuffer: Buffer;
    };

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
 *
 * Listing images are downloaded via `ImageStorage` and re-hosted under our
 * own URL rather than stored as a hotlink to the supplier's domain — many
 * sites reject direct embeds of their media from other origins, and a
 * hotlink also breaks if the supplier reorganizes their media library later.
 * A failed/unsupported image download just leaves the product without an
 * image; it never fails the import.
 */
export class ImportProductsFromFeed
  implements UseCase<ImportProductsFromFeedInput, ImportProductsFromFeedResult>
{
  constructor(
    private readonly fetcher: SupplierFeedFetcher,
    private readonly products: ProductRepository,
    private readonly createProduct: CreateProduct,
    private readonly createSupplierOffer: CreateSupplierOffer,
    private readonly imageStorage: ImageStorage,
  ) {}

  async execute(input: ImportProductsFromFeedInput): Promise<ImportProductsFromFeedResult> {
    const result =
      input.source === 'url'
        ? await this.fetcher.fetchListings(this.buildFeedUrl(input.feedUrl, input.queryParams))
        : input.source === 'json'
          ? this.fetcher.parseListings(input.rawJson)
          : await this.fetcher.parseSpreadsheet(input.fileBuffer);

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
      logger.warn('feed import failed', { source: input.source, code: error.code, message });
      return { status, message, created: 0, skipped: 0 };
    }

    let created = 0;
    let skipped = 0;

    for (const listing of result.value) {
      // findAnyBySlug: this is a duplicate check against a unique column, so
      // it has to see drafts and archived products. Imports land as `draft`,
      // so the active-only lookup would miss every previous import of the
      // same listing and fail on the slug constraint instead of skipping.
      const existing = await this.products.findAnyBySlug(listing.slug);
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
          source: 'feed_import',
          unitAmountMinor: listing.priceMinor,
          currency: listing.currency,
        });

        if (listing.imageUrl) {
          const storedImageUrl = await this.imageStorage.store(listing.imageUrl);
          if (storedImageUrl) {
            await this.products.updateImageUrl(product.id, storedImageUrl);
          }
        }

        await this.createSupplierOffer.execute({
          productId: product.id,
          supplierId: input.supplierId,
          supplierProductUrl: listing.productUrl,
          costAmountMinor: listing.priceMinor,
          costCurrency: listing.currency,
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

  private buildFeedUrl(feedUrl: string, queryParams?: string): string {
    if (!queryParams) return feedUrl;
    const url = new URL(feedUrl);
    const extra = new URLSearchParams(queryParams);
    for (const [key, value] of extra) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}
