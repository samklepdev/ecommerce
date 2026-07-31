import { ValueObject } from '@/shared/domain/value-object';
import { Money } from '@/shared/domain/money';

/** Upper bound on a single cart line's quantity — guards against a
 * runaway stepper or a tampered form value producing an absurd order. */
export const MAX_CART_LINE_QUANTITY = 99;

interface CartLineProps {
  productId: string;
  /** Snapshotted so a cart can render itself without a catalogue round-trip,
   * and so a line whose product has since gone still says what it was. */
  productName: string;
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

  get productId(): string {
    return this.props.productId;
  }

  get productName(): string {
    return this.props.productName;
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
