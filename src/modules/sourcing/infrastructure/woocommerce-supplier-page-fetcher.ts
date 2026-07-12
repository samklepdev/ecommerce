import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';

import { err, ok, type Result } from '@/shared/domain/result';
import type {
  FetchListingError,
  ScrapedListing,
  SupplierPageFetcher,
} from '@/modules/sourcing/application/ports/supplier-page-fetcher';

// Honest, identifying UA — no browser impersonation. Adjust the contact URL
// to something real before this ever talks to a live third-party site.
const USER_AGENT = 'MystoreCatalogSync/1.0 (+https://example.com/bot)';
const ROBOTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedRobots {
  robots: ReturnType<typeof robotsParser>;
  fetchedAt: number;
}

const robotsCache = new Map<string, CachedRobots>();

/**
 * Absence/unreachability of robots.txt is treated as allowed (standard
 * crawler convention — a missing robots.txt is not a disallow signal).
 */
async function isAllowedByRobots(url: string): Promise<boolean> {
  const { origin } = new URL(url);
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_CACHE_TTL_MS) {
    return cached.robots.isAllowed(url, USER_AGENT) ?? true;
  }

  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT } });
    const body = res.ok ? await res.text() : '';
    const robots = robotsParser(robotsUrl, body);
    robotsCache.set(origin, { robots, fetchedAt: Date.now() });
    return robots.isAllowed(url, USER_AGENT) ?? true;
  } catch {
    return true;
  }
}

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
