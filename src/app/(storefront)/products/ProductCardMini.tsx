import type { ReactNode } from 'react';
import Link from 'next/link';

import { Amount } from '@/components/ui/Amount';
import type { Product } from '@/modules/catalog/domain/product';
import { ProductGlyph, glyphForCategory, type GlyphKind } from './ProductGlyph';
import styles from './ProductCardMini.module.css';

export interface ProductCardSummary {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  hoverImageUrl: string | null;
  priceDisplay: string | null;
  category: string | null;
  /** Fallback art when the product has no image. */
  glyph: GlyphKind;
}

export function toProductCardSummary(product: Product): ProductCardSummary {
  return {
    id: product.id,
    slug: product.slug.value,
    name: product.name,
    imageUrl: product.imageUrl,
    hoverImageUrl: product.hoverImageUrl,
    priceDisplay: product.price.toDisplayString(),
    category: product.category,
    glyph: glyphForCategory(product.category),
  };
}

interface ProductCardMiniProps {
  product: ProductCardSummary;
  /** Price denominated in sats, shown beside the fiat figure. Omitted when
   * the rate feed is unavailable — the card degrades to fiat only rather
   * than blocking the catalog on a price API. */
  satsDisplay?: string | null;
  /** Set when the quick-add row found no purchasable offer. */
  unavailable?: boolean;
  /** Rendered at the foot — a quick-add row on the listing page, or a plain
   * price span on the "related"/"recently viewed" rows. */
  children?: ReactNode;
}

/** A catalog tile: art, category, name, dual-denominated price, and whatever
 * action the caller puts at the foot.
 *
 * Styled entirely against the role tokens in `globals.css` (--surface,
 * --line, --ink…), so it renders correctly on the light "recently viewed"
 * rows and inside the dark catalog without knowing which it is in. */
export function ProductCardMini({
  product,
  satsDisplay,
  unavailable = false,
  children,
}: ProductCardMiniProps) {
  return (
    <article className={`${styles.card} ${unavailable ? styles.unavailable : ''}`}>
      <Link href={`/products/${product.slug}`} className={styles.media}>
        {product.imageUrl ? (
          <div className={styles.imageStack}>
            {/* Supplier image hosts are dynamic/admin-added, not known at build time. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className={styles.image} />
            {product.hoverImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.hoverImageUrl} alt="" aria-hidden className={styles.hoverImage} />
            )}
          </div>
        ) : (
          <ProductGlyph kind={product.glyph} />
        )}
        {unavailable && <span className={styles.stockTag}>Out of stock</span>}
      </Link>

      <div className={styles.body}>
        {product.category && <span className={styles.eyebrow}>{product.category}</span>}
        <h3 className={styles.name}>
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h3>

        {product.priceDisplay && (
          <div className={styles.price}>
            <Amount
              fiat={product.priceDisplay}
              sats={satsDisplay}
              size="sm"
              layout="inline"
            />
          </div>
        )}
      </div>

      {children}
    </article>
  );
}
