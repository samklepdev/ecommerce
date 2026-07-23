import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

import { getContainer } from '@/composition/container';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ProductGallery } from './ProductGallery';
import { AddToCartButton } from './AddToCartButton';
import { RecentlyViewed } from './RecentlyViewed';
import styles from './page.module.css';
import type { Product } from '@/modules/catalog/domain/product';
import { ProductCardMini, toProductCardSummary } from '../ProductCardMini';
import cardStyles from '../ProductCardMini.module.css';

export const revalidate = 3600;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { getProductBySlug } = getContainer();
  const product = await getProductBySlug.execute({ slug });
  if (!product) return { title: 'Product not found' };
  return { title: product.name, description: product.description ?? undefined };
}

const RELATED_LIMIT = 4;
const RELATED_FALLBACK_LIMIT = 12;

/** Same-category products first (excluding this one); if that's short,
 * fills remaining slots with the newest active products storewide. */
async function resolveRelatedProducts(
  product: Product,
  listProducts: ReturnType<typeof getContainer>['listProducts'],
): Promise<Product[]> {
  const sameCategory = product.category
    ? (await listProducts.execute({ category: product.category, limit: RELATED_LIMIT + 1 })).items
    : [];

  const related = sameCategory.filter((p) => p.id !== product.id).slice(0, RELATED_LIMIT);
  const excludeIds = new Set([product.id, ...related.map((p) => p.id)]);

  if (related.length < RELATED_LIMIT) {
    const fallback = (
      await listProducts.execute({ sort: 'newest', limit: RELATED_FALLBACK_LIMIT })
    ).items;
    for (const p of fallback) {
      if (related.length >= RELATED_LIMIT) break;
      if (!excludeIds.has(p.id)) {
        related.push(p);
        excludeIds.add(p.id);
      }
    }
  }

  return related;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const { getProductBySlug, getPreferredOfferForVariant, getShippingRate, listProducts } = getContainer();
  const product = await getProductBySlug.execute({ slug });
  if (!product) notFound();

  const shippingRate = await getShippingRate.execute();
  const relatedProducts = await resolveRelatedProducts(product, listProducts);

  const availabilityEntries = await Promise.all(
    product.variants.map(async (variant) => {
      const offer = await getPreferredOfferForVariant.execute({ variantId: variant.id });
      // No supplier offer at all means nothing to check against — default to available.
      return [variant.id, offer?.isAvailable ?? true] as const;
    }),
  );
  const availabilityByVariant = new Map(availabilityEntries);

  const images = [
    ...(product.imageUrl ? [{ id: 'primary', url: product.imageUrl }] : []),
    ...product.additionalImages.map((img) => ({ id: img.id, url: img.url })),
  ];

  return (
    <PageContainer>
      <Stack gap={5}>
        {product.category && (
          <Breadcrumb
            items={[
              { label: 'Home', href: '/products' },
              { label: product.category, href: `/products?category=${encodeURIComponent(product.category)}` },
              { label: product.name },
            ]}
          />
        )}
        <ProductGallery images={images} productName={product.name} />

        <div>
          <h1>{product.name}</h1>
          {product.description && (
            <div className={styles.description}>
              <ReactMarkdown>{product.description}</ReactMarkdown>
            </div>
          )}
        </div>

        <Stack gap={3}>
          {product.variants.map((variant) => {
            const isAvailable = availabilityByVariant.get(variant.id) ?? true;
            return (
              <Card key={variant.id} className={styles.variantCard}>
                <div>
                  <p className={styles.variantName}>{variant.name}</p>
                  <p className={styles.price}>{variant.price.toString()}</p>
                  {!isAvailable && <Badge tone="danger">Out of stock</Badge>}
                </div>
                <AddToCartButton variantId={variant.id} isAvailable={isAvailable} />
              </Card>
            );
          })}
        </Stack>
        <p className={styles.shippingNote}>+ {shippingRate.toDisplayString()} shipping per order</p>
        {relatedProducts.length > 0 && (
          <div>
            <h2 className={styles.sectionTitle}>You might also like</h2>
            <div className={styles.relatedGrid}>
              {relatedProducts.map((related) => {
                const summary = toProductCardSummary(related);
                return (
                  <ProductCardMini key={summary.id} product={summary}>
                    {summary.priceDisplay && (
                      <span className={cardStyles.price}>{summary.priceDisplay}</span>
                    )}
                  </ProductCardMini>
                );
              })}
            </div>
          </div>
        )}
        <RecentlyViewed currentProductId={product.id} />
      </Stack>
    </PageContainer>
  );
}
