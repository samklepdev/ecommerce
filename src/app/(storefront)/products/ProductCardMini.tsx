import type { ReactNode } from 'react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import type { Product } from '@/modules/catalog/domain/product';
import styles from './ProductCardMini.module.css';

export interface ProductCardSummary {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  hoverImageUrl: string | null;
  priceDisplay: string | null;
}

export function toProductCardSummary(product: Product): ProductCardSummary {
  return {
    id: product.id,
    slug: product.slug.value,
    name: product.name,
    imageUrl: product.imageUrl,
    hoverImageUrl: product.hoverImageUrl,
    priceDisplay: product.cheapestVariantPrice?.toDisplayString() ?? null,
  };
}

interface ProductCardMiniProps {
  product: ProductCardSummary;
  /** Rendered below the title — e.g. a quick-add row on the listing page,
   * or a plain price span on the "related"/"recently viewed" rows. */
  children?: ReactNode;
}

export function ProductCardMini({ product, children }: ProductCardMiniProps) {
  return (
    <Card className={styles.card}>
      <Link href={`/products/${product.slug}`} className={styles.mediaLink}>
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
      {children}
    </Card>
  );
}
