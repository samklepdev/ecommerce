import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE, parsePage } from '@/components/ui/paginate';
import type { Product } from '@/modules/catalog/domain/product';
import { AddToCartRow } from './AddToCartRow';
import { CategoryFilterSelect } from './CategoryFilterSelect';
import styles from './page.module.css';

// Dynamic, not ISR — search/category/page are query-param-driven per
// request. (Product content itself still changes rarely; if this page
// becomes a bottleneck, cache per distinct query-param combination instead
// of reverting to a single static revalidate.)
export const dynamic = 'force-dynamic';

interface ProductsPageProps {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
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
  const { q, category, page: pageParam } = await searchParams;
  const { listProducts, listProductCategories, getPreferredOfferForVariant } = getContainer();

  const categories = await listProductCategories.execute();

  const requestedPage = parsePage(pageParam);
  let { items: pagedProducts, total } = await listProducts.execute({
    search: q,
    category,
    limit: DEFAULT_PAGE_SIZE,
    offset: (requestedPage - 1) * DEFAULT_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  let page = requestedPage;

  // Only re-fetch in the rare case the requested page is past the end
  // (e.g. a stale bookmarked link after items were removed) — everything
  // else is a single query.
  if (requestedPage > totalPages) {
    page = totalPages;
    ({ items: pagedProducts, total } = await listProducts.execute({
      search: q,
      category,
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

  function buildHref(nextPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (nextPage > 1) params.set('page', String(nextPage));
    const query = params.toString();
    return query ? `/products?${query}` : '/products';
  }

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Products</h1>

        <div className={styles.filters}>
          <form className={styles.searchForm}>
            <Input type="text" name="q" defaultValue={q} placeholder="Search products" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          {categories.length > 0 && (
            <CategoryFilterSelect categories={categories} selectedCategory={category} />
          )}
        </div>

        {pagedProducts.length === 0 ? (
          <p className={styles.empty}>No products found.</p>
        ) : (
          <div className={styles.grid}>
            {pagedProducts.map((product) => {
              const quickAdd = quickAddByProductId.get(product.id) ?? null;
              return (
                <Card key={product.id} className={styles.productCard}>
                  <Link href={`/products/${product.slug.value}`} className={styles.mediaLink}>
                    {product.imageUrl ? (
                      <div className={styles.imageStack}>
                        {/* Supplier image hosts are dynamic/admin-added, not known at build time. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={product.imageUrl} alt={product.name} className={styles.image} />
                        {product.hoverImageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.hoverImageUrl}
                            alt=""
                            aria-hidden
                            className={styles.hoverImage}
                          />
                        )}
                      </div>
                    ) : (
                      <div className={styles.imagePlaceholder} aria-hidden />
                    )}
                    <span className={styles.title}>{product.name}</span>
                  </Link>
                  {quickAdd && (
                    <AddToCartRow
                      variantId={quickAdd.variant.id}
                      priceDisplay={quickAdd.variant.price.toDisplayString()}
                      disabled={!quickAdd.isAvailable}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
      </Stack>
    </PageContainer>
  );
}
