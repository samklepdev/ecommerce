import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import type { Product } from '@/modules/catalog/domain/product';
import { AddToCartRow } from './AddToCartRow';
import styles from './page.module.css';

export const revalidate = 3600;

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

export default async function ProductsPage() {
  const { listProducts, getPreferredOfferForVariant } = getContainer();
  const products = await listProducts.execute({});

  const quickAddByProductId = new Map(
    await Promise.all(
      products.map(
        async (product) =>
          [product.id, await resolveQuickAddVariant(product, getPreferredOfferForVariant)] as const,
      ),
    ),
  );

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Products</h1>
        {products.length === 0 ? (
          <p className={styles.empty}>No products yet.</p>
        ) : (
          <div className={styles.grid}>
            {products.map((product) => {
              const quickAdd = quickAddByProductId.get(product.id) ?? null;
              return (
                <div key={product.id} className={styles.productCard}>
                  <Link href={`/products/${product.slug.value}`} className={styles.mediaLink}>
                    <Card className={styles.mediaCard}>
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
                      <span>{product.name}</span>
                    </Card>
                  </Link>
                  {quickAdd && (
                    <AddToCartRow
                      variantId={quickAdd.variant.id}
                      priceDisplay={quickAdd.variant.price.toDisplayString()}
                      disabled={!quickAdd.isAvailable}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Stack>
    </PageContainer>
  );
}
