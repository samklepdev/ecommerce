import * as cheerio from 'cheerio';

import { err, ok, type Result } from '@/shared/domain/result';
import type {
  FeedListing,
  FetchFeedError,
  SupplierFeedFetcher,
} from '@/modules/sourcing/application/ports/supplier-feed-fetcher';
import { isAllowedByRobots, USER_AGENT } from '@/modules/sourcing/infrastructure/robots-compliance';

interface StoreApiImage {
  src?: string;
}

interface StoreApiPrices {
  price: string;
  currency_code: string;
}

interface StoreApiProduct {
  id: number | string;
  slug: string;
  name: string;
  description?: string;
  permalink: string;
  prices: StoreApiPrices;
  images?: StoreApiImage[];
  is_in_stock: boolean;
}

/** Decodes HTML entities and strips tags — Store API returns `name` entity-encoded
 * and `description` as raw HTML; neither should be stored/displayed verbatim.
 * Inserts a space at block boundaries first so stripped paragraphs don't run
 * together word-to-word. */
function decodeHtml(input: string): string {
  const withBreaks = input.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, '$& ');
  return cheerio.load(withBreaks).root().text().replace(/\s+/g, ' ').trim();
}

function toListing(item: StoreApiProduct): FeedListing | null {
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
 * Fetches a WooCommerce Store API product list
 * (e.g. /wp-json/wc/store/v1/products) — a public, structured JSON endpoint,
 * not scraped HTML. Same fail-closed contract as the single-page fetcher.
 */
export class WooCommerceStoreApiFeedFetcher implements SupplierFeedFetcher {
  async fetchListings(feedUrl: string): Promise<Result<FeedListing[], FetchFeedError>> {
    const allowed = await isAllowedByRobots(feedUrl);
    if (!allowed) return err({ code: 'robots_disallowed' });

    let res: Response;
    try {
      res = await fetch(feedUrl, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
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

    if (!Array.isArray(body)) {
      return err({ code: 'parse_error', message: 'Expected a JSON array of products' });
    }
    if (body.length === 0) {
      return err({ code: 'parse_error', message: 'Feed returned zero products' });
    }

    const listings = (body as StoreApiProduct[]).map(toListing).filter((l): l is FeedListing => l !== null);
    if (listings.length === 0) {
      return err({
        code: 'parse_error',
        message: 'Could not parse any product from the feed (unexpected shape)',
      });
    }

    return ok(listings);
  }
}
