import { AggregateRoot } from '@/shared/domain/entity';
import type { Slug } from './slug';
import type { ProductVariant } from './product-variant';

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
    this.variants = props.variants;
  }

  /** The image to show on hover in a product grid, if one has been added. */
  get hoverImageUrl(): string | null {
    return this.additionalImages[0]?.url ?? null;
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
