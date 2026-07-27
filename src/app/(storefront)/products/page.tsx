import Link from 'next/link';
import { cookies } from 'next/headers';
import { after } from 'next/server';

import { getContainer } from '@/composition/container';
import { getSessionUser, GUEST_SESSION_COOKIE } from '@/app/lib/session';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE, parsePage } from '@/components/ui/paginate';
import type { Product } from '@/modules/catalog/domain/product';
import type { ProductSort } from '@/modules/catalog/application/ports/product-repository';
import { AddToCartRow } from './AddToCartRow';
import { CategoryFilterSelect } from './CategoryFilterSelect';
import { SortSelect } from './SortSelect';
import { ProductCardMini, toProductCardSummary } from './ProductCardMini';
import { formatSats, tryGetSatsRate } from './sats-pricing';
import styles from './page.module.css';

// Dynamic, not ISR — search/category/page are query-param-driven per
// request. (Product content itself still changes rarely; if this page
// becomes a bottleneck, cache per distinct query-param combination instead
// of reverting to a single static revalidate.)
export const dynamic = 'force-dynamic';

const countFormat = new Intl.NumberFormat('en-US');

interface ProductsPageProps {
  searchParams: Promise<{ q?: string; category?: string; sort?: ProductSort; page?: string }>;
}

/** Picks which variant the listing card's quick-add row targets: the first
 * variant with a preferred supplier offer configured, falling back to the
 * first variant if none do — same "no offer means nothing to check against,
 * default to available" convention the product detail page already uses. */
async function resolveQuickAddVariant(
  product: Product,
  getPreferredOfferForVariant: ReturnType<typeof getContainer>['getPreferredOfferForVariant'],
): Promise<{ variant: Product['variants'][number]; isAvailable: boolean } | null> {
  if (product.variants.length === 0) return null;

  for (const variant of product.variants) {
    const offer = await getPreferredOfferForVariant.execute({ variantId: variant.id });
    if (offer) return { variant, isAvailable: offer.isAvailable };
  }

  return { variant: product.variants[0]!, isAvailable: true };
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { q, category, sort, page: pageParam } = await searchParams;
  const { listProducts, listProductCategories, getPreferredOfferForVariant, btcRates } =
    getContainer();

  const categories = await listProductCategories.execute();

  const requestedPage = parsePage(pageParam);
  let { items: pagedProducts, total } = await listProducts.execute({
    search: q,
    category,
    sort,
    limit: DEFAULT_PAGE_SIZE,
    offset: (requestedPage - 1) * DEFAULT_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  let page = requestedPage;

  if (q) {
    const searchTerm = q;
    const resultCount = total;
    after(async () => {
      const { recordAnalyticsEvent } = getContainer();
      try {
        const [user, cookieStore] = await Promise.all([getSessionUser(), cookies()]);
        await recordAnalyticsEvent.execute({
          eventType: 'search',
          sessionId: user ? user.id : (cookieStore.get(GUEST_SESSION_COOKIE)?.value ?? null),
          userId: user?.id ?? null,
          path: '/products',
          metadata: { term: searchTerm, resultCount },
        });
      } catch {
        // Best-effort — a tracking failure must never surface to a visitor.
      }
    });
  }

  // Only re-fetch in the rare case the requested page is past the end
  // (e.g. a stale bookmarked link after items were removed) — everything
  // else is a single query.
  if (requestedPage > totalPages) {
    page = totalPages;
    ({ items: pagedProducts, total } = await listProducts.execute({
      search: q,
      category,
      sort,
      limit: DEFAULT_PAGE_SIZE,
      offset: (page - 1) * DEFAULT_PAGE_SIZE,
    }));
  }

  const quickAddByProductId = new Map(
    await Promise.all(
      pagedProducts.map(
        async (product) =>
          [product.id, await resolveQuickAddVariant(product, getPreferredOfferForVariant)] as const,
      ),
    ),
  );

  // Cached ~30s inside the provider, and null when the feed is unreachable —
  // the catalog then shows fiat alone rather than failing.
  const currency = pagedProducts[0]?.cheapestVariantPrice?.currency ?? 'USD';
  const satsPerUnit = await tryGetSatsRate(btcRates, currency);

  function buildHref(nextPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (sort && sort !== 'newest') params.set('sort', sort);
    if (nextPage > 1) params.set('page', String(nextPage));
    const query = params.toString();
    return query ? `/products?${query}` : '/products';
  }

  const hasFilters = Boolean(q || category);

  return (
    <div className={styles.root}>
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <h1>Products</h1>
          <p className={styles.lede}>
            Hardware and backup gear for holding your own keys. Every price settles on-chain —
            no custodian in the middle.
          </p>
        </div>

        <div className={styles.filters}>
          <form className={styles.searchForm}>
            {/* Category and sort ride along so searching doesn't silently
                drop the filters already applied. */}
            {category && <input type="hidden" name="category" value={category} />}
            {sort && sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search products"
              aria-label="Search products"
              className={styles.searchInput}
            />
            <button type="submit" className={styles.searchButton}>
              Search
            </button>
          </form>

          <div className={styles.dropdownGroup}>
            {categories.length > 0 && (
              <CategoryFilterSelect categories={categories} selectedCategory={category} />
            )}
            <SortSelect selectedSort={sort} />
          </div>
        </div>

        <div className={styles.resultBar}>
          <span className={styles.resultCount}>
            {countFormat.format(total)} {total === 1 ? 'product' : 'products'}
            {totalPages > 1 && ` · page ${page} of ${totalPages}`}
          </span>
          {hasFilters && (
            <Link href="/products" className={styles.clearLink}>
              Clear filters
            </Link>
          )}
        </div>

        {pagedProducts.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Nothing matches those filters.</p>
            <p className={styles.emptyBody}>
              Try a broader search term, or browse the full catalog.
            </p>
            <Link href="/products" className={styles.emptyAction}>
              Show all products
            </Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {pagedProducts.map((product) => {
              const quickAdd = quickAddByProductId.get(product.id) ?? null;
              const price = product.cheapestVariantPrice;

              return (
                <ProductCardMini
                  key={product.id}
                  product={toProductCardSummary(product)}
                  satsDisplay={
                    price && satsPerUnit !== null
                      ? formatSats(price.amountMinor, satsPerUnit)
                      : null
                  }
                  unavailable={quickAdd ? !quickAdd.isAvailable : false}
                >
                  {quickAdd && (
                    <AddToCartRow variantId={quickAdd.variant.id} disabled={!quickAdd.isAvailable} />
                  )}
                </ProductCardMini>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
          </div>
        )}
      </div>
    </div>
  );
}
