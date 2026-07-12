import * as cheerio from 'cheerio';

import { err, ok, type Result } from '@/shared/domain/result';
import type {
  FetchListingError,
  ScrapedListing,
  SupplierPageFetcher,
} from '@/modules/sourcing/application/ports/supplier-page-fetcher';
import { isAllowedByRobots, USER_AGENT } from '@/modules/sourcing/infrastructure/robots-compliance';

function parsePriceToMinorUnits(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

/**
 * Parses a WooCommerce product page. Fails closed on anything resembling a
 * block: non-2xx responses are `blocked`, never retried with different
 * headers or a different UA.
 */
export class WooCommerceSupplierPageFetcher implements SupplierPageFetcher {
  async fetchListing(url: string): Promise<Result<ScrapedListing, FetchListingError>> {
    const allowed = await isAllowedByRobots(url);
    if (!allowed) return err({ code: 'robots_disallowed' });

    let res: Response;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (e) {
      return err({ code: 'network_error', message: e instanceof Error ? e.message : String(e) });
    }

    if (!res.ok) {
      return err({ code: 'blocked', httpStatus: res.status });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $('h1.product_title').first().text().trim();
    const priceText =
      $('.summary .price .woocommerce-Price-amount').first().text().trim() ||
      $('.price .woocommerce-Price-amount').first().text().trim();
    const imageUrl =
      $('.woocommerce-product-gallery__image img').first().attr('src') ||
      $('.woocommerce-product-gallery img').first().attr('src') ||
      null;

    if (!title || !priceText) {
      return err({
        code: 'parse_error',
        message: 'Could not find product title or price on page',
      });
    }

    const priceMinor = parsePriceToMinorUnits(priceText);
    if (priceMinor === null) {
      return err({ code: 'parse_error', message: `Could not parse price text: "${priceText}"` });
    }

    const productEl = $('div.product').first();
    const available =
      productEl.length > 0 ? !productEl.hasClass('outofstock') : !$('body').hasClass('outofstock');

    return ok({ title, imageUrl, priceMinor, currency: 'USD', available });
  }
}
