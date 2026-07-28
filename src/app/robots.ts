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
 * If the store ever does want organic traffic, this is the one file to
 * change — the product pages already carry titles, descriptions and Open
 * Graph tags.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
