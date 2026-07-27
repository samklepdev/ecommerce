import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

import { getContainer } from '@/composition/container';
import type { Product } from '@/modules/catalog/domain/product';
import { ProductGallery } from './ProductGallery';
import { BuyBox, type BuyBoxVariant } from './BuyBox';
import { ProductTabs } from './ProductTabs';
import { Rating } from './Rating';
import { RecentlyViewed } from './RecentlyViewed';
import { ReviewsSection } from './ReviewsSection';
import { ProductCardMini, toProductCardSummary } from '../ProductCardMini';
import { formatSats, tryGetSatsRate } from '../sats-pricing';
import styles from './page.module.css';

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
const SATS_PER_BTC = 100_000_000;

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
    const fallback = (await listProducts.execute({ sort: 'newest', limit: RELATED_FALLBACK_LIMIT }))
      .items;
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
  const { getProductBySlug, getPreferredOfferForVariant, getShippingRate, listProducts, btcRates } =
    getContainer();

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

  // Cached ~30s inside the provider, and null when the feed is unreachable —
  // the page then shows fiat alone rather than failing.
  const currency = product.variants[0]?.price.currency ?? 'USD';
  const satsPerUnit = await tryGetSatsRate(btcRates, currency);
  const btcRateLabel =
    satsPerUnit === null
      ? null
      : `1 BTC = ${new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(SATS_PER_BTC / satsPerUnit)}`;

  const variants: BuyBoxVariant[] = product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    priceDisplay: variant.price.toDisplayString(),
    satsDisplay: satsPerUnit === null ? null : formatSats(variant.price.amountMinor, satsPerUnit),
    priceMinor: variant.price.amountMinor,
    currency: variant.price.currency,
    isAvailable: availabilityByVariant.get(variant.id) ?? true,
  }));

  return (
    <div className={styles.root}>
      <div className={styles.page}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/products">Shop</Link>
          {product.category && (
            <>
              <span className={styles.crumbSep} aria-hidden="true">
                /
              </span>
              <Link href={`/products?category=${encodeURIComponent(product.category)}`}>
                {product.category}
              </Link>
            </>
          )}
          <span className={styles.crumbSep} aria-hidden="true">
            /
          </span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <div className={styles.buyArea}>
          <ProductGallery images={images} productName={product.name} />

          <section className={styles.buyColumn}>
            {product.category && <span className={styles.eyebrow}>{product.category}</span>}
            <h1 className={styles.title}>{product.name}</h1>

            <ProductRating productId={product.id} />

            <BuyBox variants={variants} btcRateLabel={btcRateLabel} />

            <p className={styles.shippingNote}>
              + {shippingRate.toDisplayString()} shipping per order · discreet, unbranded packaging
            </p>

            {/* Every line here is true of this store specifically — see
                CLAUDE.md on non-custodial settlement and address reuse. */}
            <div className={styles.trust}>
              <span>
                <i className={styles.dotAccent} />
                Paid on-chain — funds settle straight to our node, with no custodian in between
              </span>
              <span>
                <i className={styles.dotAmber} />
                The invoice locks its sats amount when you check out
              </span>
              <span>
                <i className={styles.dotAccent} />
                Every order gets its own receive address, never reused
              </span>
            </div>
          </section>
        </div>

        <ProductTabs
          description={
            product.description ? (
              <div className={styles.prose}>
                <ReactMarkdown>{product.description}</ReactMarkdown>
              </div>
            ) : null
          }
        />

        <ReviewsSection productId={product.id} productSlug={product.slug.value} />

        {relatedProducts.length > 0 && (
          <section>
            <div className={styles.sectionHeader}>
              <h2>You might also like</h2>
            </div>
            <div className={styles.cardGrid}>
              {relatedProducts.map((related) => {
                const summary = toProductCardSummary(related);
                const price = related.cheapestVariantPrice;
                return (
                  <ProductCardMini
                    key={summary.id}
                    product={summary}
                    satsDisplay={
                      price && satsPerUnit !== null
                        ? formatSats(price.amountMinor, satsPerUnit)
                        : null
                    }
                  />
                );
              })}
            </div>
          </section>
        )}

        <RecentlyViewed currentProductId={product.id} />
      </div>
    </div>
  );
}

/** The headline rating, reading the same reviews query the section below
 * uses. Kept separate so the buy area — the part people came for — doesn't
 * wait on it. */
async function ProductRating({ productId }: { productId: string }) {
  const { getProductReviews } = getContainer();
  const { summary } = await getProductReviews.execute({ productId });

  if (summary.count === 0) return null;

  return (
    <a className={styles.ratingLink} href="#reviews">
      <Rating value={summary.average} size={15} showValue count={summary.count} />
    </a>
  );
}
