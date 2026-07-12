import { ValueObject } from '@/shared/domain/value-object';
import { Money } from '@/shared/domain/money';

interface CartLineProps {
  variantId: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}

export class CartLine extends ValueObject<CartLineProps> {
  private constructor(props: CartLineProps) {
    super(props);
  }

  static create(props: CartLineProps): CartLine {
    if (props.quantity <= 0) throw new Error('CartLine quantity must be positive');
    return new CartLine(props);
  }

  get variantId(): string {
    return this.props.variantId;
  }

  get sku(): string {
    return this.props.sku;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get unitPrice(): Money {
    return this.props.unitPrice;
  }

  get subtotal(): Money {
    return this.props.unitPrice.multiply(this.props.quantity);
  }

  withQuantity(quantity: number): CartLine {
    return CartLine.create({ ...this.props, quantity });
  }
}
