import * as cheerio from 'cheerio';

import { err, ok, type Result } from '@/shared/domain/result';
import { parseDecimalToMinorUnits } from '@/shared/domain/parse-decimal-amount';
import { isAllowedByRobots, USER_AGENT } from '@/modules/sourcing/infrastructure/robots-compliance';
import type {
  ExtractedUrlContent,
  ExtractUrlContentError,
  UrlContentExtractor,
} from '@/modules/sourcing/application/ports/url-content-extractor';
import { safeFetch } from './safe-fetch';

const MAX_TEXT_LENGTH = 8000;

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
};

function resolveUrl(maybeRelative: string | undefined, base: string): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

/** "Product Name | Site Name" / "Product Name - Site Name" / "Product Name – Site Name"
 * — keeps the first segment, which is conventionally the page-specific part. */
function cleanTitle(title: string): string {
  const [first] = title.split(/\s[|\-–—]\s/);
  return (first ?? title).trim();
}

/** First currency-symbol-prefixed decimal amount in the text, in document
 * order. A predictable, naive heuristic — the admin is expected to correct
 * it if it picked up the wrong number. */
function guessPrice(text: string): { priceMinor: number; currency: string } | null {
  const match = text.match(/([$€£])\s?([\d,]+\.\d{2})/);
  if (!match) return null;
  const [, symbol, amount] = match;
  const priceMinor = parseDecimalToMinorUnits(amount!.replace(/,/g, ''));
  if (priceMinor === null) return null;
  return { priceMinor, currency: CURRENCY_SYMBOLS[symbol!] ?? 'USD' };
}

/**
 * Fetches one admin-provided URL, strips it down to plain text (no
 * per-site selectors), and makes a handful of best-effort guesses from
 * generic, near-universal conventions: `<h1>`/`<title>` for the name,
 * Open Graph meta tags for image/description, a regex over the visible
 * text for price. Never evaluates or executes anything from the page.
 */
export class HtmlUrlContentExtractor implements UrlContentExtractor {
  async extract(url: string): Promise<Result<ExtractedUrlContent, ExtractUrlContentError>> {
    const allowed = await isAllowedByRobots(url);
    if (!allowed) return err({ code: 'robots_disallowed' });

    let res: Response;
    try {
      res = await safeFetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (e) {
      return err({ code: 'network_error', message: e instanceof Error ? e.message : String(e) });
    }

    if (!res.ok) {
      return err({ code: 'blocked', httpStatus: res.status });
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, template, svg').remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const text = bodyText.slice(0, MAX_TEXT_LENGTH);

    const h1Name = $('h1').first().text().trim();
    const titleName = cleanTitle($('title').first().text().trim());
    const guessedName = h1Name || titleName || null;

    const ogDescription = $('meta[property="og:description"]').attr('content')?.trim();
    const metaDescription = $('meta[name="description"]').attr('content')?.trim();
    const guessedDescription = ogDescription || metaDescription || null;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const firstImg = $('img').first().attr('src');
    const guessedImageUrl = resolveUrl(ogImage, url) ?? resolveUrl(firstImg, url);

    const price = guessPrice(bodyText);

    return ok({
      url,
      text,
      guessedName,
      guessedDescription,
      guessedImageUrl,
      guessedPriceMinor: price?.priceMinor ?? null,
      guessedCurrency: price?.currency ?? null,
    });
  }
}
