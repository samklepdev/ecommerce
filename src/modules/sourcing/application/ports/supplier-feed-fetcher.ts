import type { Result } from '@/shared/domain/result';

export interface FeedListing {
  externalId: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number;
  currency: string;
  available: boolean;
  /** The item's own product page — stored as the resulting offer's supplierProductUrl. */
  productUrl: string;
}

export type FetchFeedError =
  | { code: 'robots_disallowed' }
  | { code: 'blocked'; httpStatus: number }
  | { code: 'parse_error'; message: string }
  | { code: 'network_error'; message: string };

/**
 * Fetches a bulk product feed (e.g. the WooCommerce Store API's
 * /wp-json/wc/store/v1/products) in one request, rather than scraping one
 * page per product. Same fail-closed contract as SupplierPageFetcher: never
 * retries or alters its approach on a block.
 */
export interface SupplierFeedFetcher {
  fetchListings(feedUrl: string): Promise<Result<FeedListing[], FetchFeedError>>;
}
