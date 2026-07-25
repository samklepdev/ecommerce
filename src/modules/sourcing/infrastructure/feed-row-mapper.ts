import type { FeedListing } from '@/modules/sourcing/application/ports/supplier-feed-fetcher';
import { decodeHtml } from '@/modules/sourcing/infrastructure/decode-html';
import { slugify } from '@/shared/domain/slugify';
import { parseDecimalToMinorUnits } from '@/shared/domain/parse-decimal-amount';

/** "Product URL", "product-url", "PRODUCT_URL" all normalize to the same
 * key as "product_url" — real spreadsheet exports (Excel/Google Sheets/
 * Shopify) use Title Case headers with spaces, not the snake_case a JSON
 * feed would use, so matching must ignore case/spacing/punctuation. */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }
  return normalized;
}

function firstNonEmpty(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  return undefined;
}

const UNAVAILABLE_VALUES = new Set(['false', 'no', 'n', '0', 'out of stock', 'unavailable']);
const AVAILABLE_VALUES = new Set(['true', 'yes', 'y', '1', 'in stock', 'available']);

/** Unspecified defaults to available — a spreadsheet without a stock column
 * is more often "didn't bother tracking it" than "definitely out of stock". */
function parseAvailable(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return true;
  const value = raw.trim().toLowerCase();
  if (UNAVAILABLE_VALUES.has(value)) return false;
  if (AVAILABLE_VALUES.has(value)) return true;
  const n = Number(value);
  return Number.isFinite(n) ? n > 0 : true;
}

/**
 * Maps a flat spreadsheet/CSV row to a `FeedListing`, tolerating a handful
 * of common header spellings. Unlike the nested feed JSON shape, a slug is
 * derived from the name when omitted, currency defaults to USD, and price
 * is read as a decimal ("19.99"), not pre-computed minor units — matching
 * how a human fills in a spreadsheet rather than what an API returns.
 * Returns null (row skipped) when name, price, or slug can't be resolved.
 * A spreadsheet is also useful as a catalog source when it has no supplier
 * product URL, so those rows receive a stable URN source reference. This
 * satisfies SupplierOffer's non-empty source invariant without pretending
 * an HTTP product page exists.
 */
export function toListingFromRow(rawRow: Record<string, string>): FeedListing | null {
  const row = normalizeRow(rawRow);
  const name = firstNonEmpty(row, ['name', 'title', 'product_name']);
  const priceRaw = firstNonEmpty(row, ['price']);
  if (!name || !priceRaw) return null;

  const priceMinor = parseDecimalToMinorUnits(priceRaw);
  if (priceMinor === null) return null;

  const slugSource = firstNonEmpty(row, ['slug', 'handle']) ?? name;
  const slug = slugify(slugSource);
  if (!slug) return null;
  const externalId = firstNonEmpty(row, ['id', 'external_id', 'sku']) ?? slug;
  const productUrl =
    firstNonEmpty(row, ['permalink', 'product_url', 'url', 'link']) ??
    `urn:spreadsheet-product:${encodeURIComponent(externalId)}`;

  const description = firstNonEmpty(row, ['description', 'desc']);
  const imageUrl = firstNonEmpty(row, ['image', 'image_url', 'photo']);

  return {
    externalId,
    slug,
    name: decodeHtml(name),
    description: description ? decodeHtml(description) : null,
    imageUrl: imageUrl ?? null,
    priceMinor,
    currency: (firstNonEmpty(row, ['currency', 'currency_code']) ?? 'USD').toUpperCase(),
    available: parseAvailable(firstNonEmpty(row, ['available', 'in_stock', 'stock'])),
    productUrl,
  };
}
