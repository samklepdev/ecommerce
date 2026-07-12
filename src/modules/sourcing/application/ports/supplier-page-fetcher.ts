import type { Result } from '@/shared/domain/result';

export interface ScrapedListing {
  title: string;
  imageUrl: string | null;
  priceMinor: number;
  currency: string;
  available: boolean;
}

export type FetchListingError =
  | { code: 'robots_disallowed' }
  | { code: 'blocked'; httpStatus: number }
  | { code: 'parse_error'; message: string }
  | { code: 'network_error'; message: string };

/**
 * Fetches and parses a single supplier product page. Implementations must
 * fail closed on any block/challenge response (never retry with different
 * headers or attempt to evade detection) and must honor robots.txt.
 */
export interface SupplierPageFetcher {
  fetchListing(url: string): Promise<Result<ScrapedListing, FetchListingError>>;
}
