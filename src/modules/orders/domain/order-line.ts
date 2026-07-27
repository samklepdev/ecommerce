import { Entity } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';

export interface OrderLineProps {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
}

export class OrderLine extends Entity<string> {
  readonly productId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: Money;

  private constructor(props: OrderLineProps) {
    super(props.id);
    this.productId = props.productId;
    this.sku = props.sku;
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
