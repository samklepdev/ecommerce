import { Entity } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';

export interface ProductVariantProps {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: Money;
}

export class ProductVariant extends Entity<string> {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly price: Money;

  private constructor(props: ProductVariantProps) {
    super(props.id);
    this.productId = props.productId;
    this.sku = props.sku;
    this.name = props.name;
    this.price = props.price;
  }

  static create(props: ProductVariantProps): ProductVariant {
    if (!props.sku.trim()) throw new Error('ProductVariant requires a non-empty sku');
    return new ProductVariant(props);
  }
}
