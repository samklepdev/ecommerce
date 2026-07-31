import { Entity } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';

export interface OrderLineProps {
  id: string;
  productId: string;
  /** The product's name as it was when the order was placed. A snapshot, not
   * a lookup: re-reading it from the catalogue would let a later rename
   * rewrite what an old receipt says was bought. */
  productName: string;
  quantity: number;
  unitPrice: Money;
}

export class OrderLine extends Entity<string> {
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: Money;

  private constructor(props: OrderLineProps) {
    super(props.id);
    this.productId = props.productId;
    this.productName = props.productName;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
  }

  static create(props: OrderLineProps): OrderLine {
    if (props.quantity <= 0) throw new Error('OrderLine quantity must be positive');
    return new OrderLine(props);
  }

  get subtotal(): Money {
    return this.unitPrice.multiply(this.quantity);
  }
}
