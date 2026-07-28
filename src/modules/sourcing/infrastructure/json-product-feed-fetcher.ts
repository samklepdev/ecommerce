import { err, ok, type Result } from '@/shared/domain/result';
import type {
  FeedListing,
  FetchFeedError,
  SupplierFeedFetcher,
} from '@/modules/sourcing/application/ports/supplier-feed-fetcher';
import { isAllowedByRobots, USER_AGENT } from '@/modules/sourcing/infrastructure/robots-compliance';
import { decodeHtml } from '@/modules/sourcing/infrastructure/decode-html';
import { parseSpreadsheetRows } from '@/modules/sourcing/infrastructure/spreadsheet-rows';
import { toListingFromRow } from '@/modules/sourcing/infrastructure/feed-row-mapper';
import { safeFetch } from './safe-fetch';

interface FeedImage {
  src?: string;
}

interface FeedPrices {
  price: string;
  currency_code: string;
}

interface FeedProduct {
  id: number | string;
  slug: string;
  name: string;
  description?: string;
  permalink: string;
  prices: FeedPrices;
  images?: FeedImage[];
  is_in_stock: boolean;
}

function toListing(item: FeedProduct): FeedListing | null {
  const priceMinor = Number(item.prices?.price);
  if (!item.slug || !item.name || !Number.isFinite(priceMinor)) return null;

  return {
    externalId: String(item.id),
    slug: item.slug,
    name: decodeHtml(item.name),
    description: item.description ? decodeHtml(item.description) : null,
    imageUrl: item.images?.[0]?.src ?? null,
    priceMinor,
    currency: item.prices.currency_code,
    available: Boolean(item.is_in_stock),
    productUrl: item.permalink,
  };
}

/**
 * Fetches/parses a bulk product list for import. Three input shapes:
 * a live JSON feed URL (`fetchListings`), JSON text already in hand —
 * including a `.js`/`.ts` module export of the same array (`parseListings`)
 * — or an uploaded `.csv`/`.xlsx` file (`parseSpreadsheet`), which uses a
 * flatter column-based shape since spreadsheets don't nest. Same fail-closed
 * contract throughout: never retries, never guesses past what's mapped.
 */
export class JsonProductFeedFetcher implements SupplierFeedFetcher {
  async fetchListings(feedUrl: string): Promise<Result<FeedListing[], FetchFeedError>> {
    const allowed = await isAllowedByRobots(feedUrl);
    if (!allowed) return err({ code: 'robots_disallowed' });

    let res: Response;
    try {
      res = await safeFetch(feedUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
    } catch (e) {
      return err({ code: 'network_error', message: e instanceof Error ? e.message : String(e) });
    }

    if (!res.ok) {
      return err({ code: 'blocked', httpStatus: res.status });
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      return err({
        code: 'parse_error',
        message: `Response was not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    return toListings(body);
  }

  parseListings(rawJson: string): Result<FeedListing[], FetchFeedError> {
    let body: unknown;
    try {
      body = JSON.parse(extractJsonLiteral(rawJson));
    } catch (e) {
      return err({
        code: 'parse_error',
        message: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    return toListings(body);
  }

  async parseSpreadsheet(buffer: Buffer): Promise<Result<FeedListing[], FetchFeedError>> {
    let rows: Record<string, string>[];
    try {
      rows = await parseSpreadsheetRows(buffer);
    } catch (e) {
      return err({
        code: 'parse_error',
        message: `Could not read file: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    if (rows.length === 0) {
      return err({ code: 'parse_error', message: 'File contains no data rows' });
    }

    const listings = rows.map(toListingFromRow).filter((l): l is FeedListing => l !== null);
    if (listings.length === 0) {
      const detectedHeaders = Object.keys(rows[0] ?? {});
      const headerDetails =
        detectedHeaders.length > 0
          ? ` Detected columns: ${detectedHeaders.join(', ')}.`
          : ' No columns were detected.';
      return err({
        code: 'parse_error',
        message:
          'Could not parse any products. Required columns: name (or title) and price.' +
          headerDetails,
      });
    }

    return ok(listings);
  }
}

/**
 * Lets a `.js`/`.ts` module export of the same array (e.g.
 * `export const products = [...]` or `export default [...]`) parse like a
 * plain `.json` file — strips the wrapper via string matching only, then
 * still goes through `JSON.parse`. The file is never evaluated as code:
 * anything that isn't a JSON-shaped literal underneath (function calls,
 * template literals, unquoted keys, etc.) fails `JSON.parse` and is
 * reported as a normal parse error, not executed.
 */
function extractJsonLiteral(source: string): string {
  const trimmed = source.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return trimmed;

  const esmMatch = trimmed.match(
    /^export\s+(?:default\s+|const\s+\w+\s*(?::[^=]+)?=\s*)([\s\S]*?);?\s*$/,
  );
  if (esmMatch) return esmMatch[1]!.trim();

  const cjsMatch = trimmed.match(/^module\.exports\s*=\s*([\s\S]*?);?\s*$/);
  if (cjsMatch) return cjsMatch[1]!.trim();

  return trimmed;
}

function toListings(body: unknown): Result<FeedListing[], FetchFeedError> {
  if (!Array.isArray(body)) {
    return err({ code: 'parse_error', message: 'Expected a JSON array of products' });
  }
  if (body.length === 0) {
    return err({ code: 'parse_error', message: 'Feed returned zero products' });
  }

  const listings = (body as FeedProduct[]).map(toListing).filter((l): l is FeedListing => l !== null);
  if (listings.length === 0) {
    return err({
      code: 'parse_error',
      message: 'Could not parse any product from the feed (unexpected shape)',
    });
  }

  return ok(listings);
}
