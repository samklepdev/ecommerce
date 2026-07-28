import type { MetadataRoute } from 'next';

/**
 * Nothing is indexed. Not a subset — everything.
 *
 * This is a deliberate stance, not an oversight: a non-custodial bitcoin
 * storefront's catalog, prices and product set are not things the operator
 * wants search engines cataloguing and archiving. There is no sitemap for
 * the same reason — a sitemap exists to *get* indexed.
 *
 * Note what this is and isn't. robots.txt is a request that well-behaved
 * crawlers honour; it is not access control and not a privacy guarantee.
 * Anything that must not be reachable has to be guarded server-side (as
 * /admin and /account already are), because a crawler that ignores this
 * file can still fetch every public URL.
 *
 * Product pages carry a title and description and nothing else — no Open
 * Graph, no Twitter cards, no structured data. If the store ever does want
 * to be found or to unfurl nicely when shared, those come back alongside a
 * change here; none of it is load-bearing today.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
