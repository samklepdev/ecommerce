import type { Result } from '@/shared/domain/result';

export interface ExtractedUrlContent {
  url: string;
  /** Stripped, whitespace-collapsed visible text (script/style removed),
   * truncated to a sane length — for the admin to read/copy from directly. */
  text: string;
  guessedName: string | null;
  guessedDescription: string | null;
  guessedImageUrl: string | null;
  guessedPriceMinor: number | null;
  guessedCurrency: string | null;
}

export type ExtractUrlContentError =
  | { code: 'robots_disallowed' }
  | { code: 'blocked'; httpStatus: number }
  | { code: 'network_error'; message: string };

/**
 * Fetches a single admin-provided URL and turns it into plain readable text
 * plus a handful of best-effort guesses (name/price/image/description) —
 * not structured per-site scraping with site-specific selectors. Guesses
 * may be wrong; the admin reads the stripped text and corrects the form
 * themselves. Same fail-closed contract as the rest of sourcing: robots.txt-
 * checked, honest UA, never retried on a block.
 */
export interface UrlContentExtractor {
  extract(url: string): Promise<Result<ExtractedUrlContent, ExtractUrlContentError>>;
}
