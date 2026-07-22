import { AggregateRoot } from '@/shared/domain/entity';
import type { Slug } from './slug';
import type { ProductVariant } from './product-variant';
import type { Money } from '@/shared/domain/money';

export type ProductStatus = 'draft' | 'active' | 'archived';
export type ProductSource = 'manual' | 'feed_import';

/** An image beyond the product's primary `imageUrl` — e.g. a hover/alternate
 * shot. Ordered by `position` (ascending, starting at 1; 0 is the primary). */
export interface ProductImage {
  id: string;
  url: string;
  position: number;
}

export interface ProductProps {
  id: string;
  slug: Slug;
  name: string;
  description: string | null;
  imageUrl?: string | null;
  additionalImages?: ProductImage[];
  status: ProductStatus;
  source?: ProductSource;
  category?: string | null;
  variants: ProductVariant[];
}

export class Product extends AggregateRoot<string> {
  readonly slug: Slug;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly additionalImages: ProductImage[];
  readonly status: ProductStatus;
  readonly source: ProductSource;
  readonly category: string | null;
  readonly variants: ProductVariant[];

  private constructor(props: ProductProps) {
    super(props.id);
    this.slug = props.slug;
    this.name = props.name;
    this.description = props.description;
    this.imageUrl = props.imageUrl ?? null;
    this.additionalImages = props.additionalImages ?? [];
    this.status = props.status;
    this.source = props.source ?? 'manual';
    this.category = props.category ?? null;
    this.variants = props.variants;
  }

  /** The image to show on hover in a product grid, if one has been added. */
  get hoverImageUrl(): string | null {
    return this.additionalImages[0]?.url ?? null;
  }

  /** The lowest-priced variant's price — for display contexts with no
   * specific variant selected yet (e.g. "You might also like" cards). Null
   * only if the product has no variants at all. */
  get cheapestVariantPrice(): Money | null {
    if (this.variants.length === 0) return null;
    return this.variants.reduce((min, v) =>
      v.price.amountMinor < min.price.amountMinor ? v : min,
    ).price;
  }

  static create(props: ProductProps): Product {
    if (!props.name.trim()) throw new Error('Product requires a non-empty name');
    return new Product(props);
  }

  get isActive(): boolean {
    return this.status === 'active';
  }

  findVariant(variantId: string): ProductVariant | undefined {
    return this.variants.find((v) => v.id === variantId);
  }
}
