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
 * Fetches a supplier's bulk product feed (a JSON array of products) in one
 * request, rather than scraping one page per product. Platform-agnostic —
 * any endpoint returning this shape works. Fail-closed: never retries or
 * alters its approach on a block.
 */
export interface SupplierFeedFetcher {
  fetchListings(feedUrl: string): Promise<Result<FeedListing[], FetchFeedError>>;
  /** Same parsing/validation as `fetchListings`, for JSON an admin already
   * has in hand (e.g. a pasted/uploaded export) rather than a live URL —
   * no network fetch, no robots check. */
  parseListings(rawJson: string): Result<FeedListing[], FetchFeedError>;
  /** Same idea, for an uploaded `.csv`/`.xlsx` file — a flat, column-based
   * shape (name/price/slug/product url/... headers) rather than the nested
   * feed JSON shape, since spreadsheets don't nest. */
  parseSpreadsheet(buffer: Buffer): Promise<Result<FeedListing[], FetchFeedError>>;
}
