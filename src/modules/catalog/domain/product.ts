import { AggregateRoot } from '@/shared/domain/entity';
import type { Slug } from './slug';
import type { ProductVariant } from './product-variant';

export type ProductStatus = 'draft' | 'active' | 'archived';

export interface ProductProps {
  id: string;
  slug: Slug;
  name: string;
  description: string | null;
  imageUrl?: string | null;
  status: ProductStatus;
  variants: ProductVariant[];
}

export class Product extends AggregateRoot<string> {
  readonly slug: Slug;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly status: ProductStatus;
  readonly variants: ProductVariant[];

  private constructor(props: ProductProps) {
    super(props.id);
    this.slug = props.slug;
    this.name = props.name;
    this.description = props.description;
    this.imageUrl = props.imageUrl ?? null;
    this.status = props.status;
    this.variants = props.variants;
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
