import { AggregateRoot } from '@/shared/domain/entity';
import { Money } from '@/shared/domain/money';
import type { OrderLine } from './order-line';
import type { ShippingAddress } from './shipping-address';
import {
  assertFulfillmentTransition,
  assertPaymentTransition,
  type FulfillmentStatus,
  type PaymentStatus,
} from './order-status';

export interface OrderProps {
  id: string;
  userId: string | null;
  customerEmail: string;
  shippingAddress: ShippingAddress;
  lines: OrderLine[];
  currency: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  shippingAmount: Money;
}

export class Order extends AggregateRoot<string> {
  readonly userId: string | null;
  readonly customerEmail: string;
  readonly shippingAddress: ShippingAddress;
  readonly lines: OrderLine[];
  readonly currency: string;
  readonly paymentStatus: PaymentStatus;
  readonly fulfillmentStatus: FulfillmentStatus;
  readonly shippingAmount: Money;

  private constructor(props: OrderProps) {
    super(props.id);
    this.userId = props.userId;
    this.customerEmail = props.customerEmail;
    this.shippingAddress = props.shippingAddress;
    this.lines = props.lines;
    this.currency = props.currency;
    this.paymentStatus = props.paymentStatus;
    this.fulfillmentStatus = props.fulfillmentStatus;
    this.shippingAmount = props.shippingAmount;
  }

  static create(props: OrderProps): Order {
    if (props.lines.length === 0) throw new Error('Order requires at least one line');
    return new Order(props);
  }

  get subtotal(): Money {
    return this.lines.reduce((sum, l) => sum.add(l.subtotal), Money.zero(this.currency));
  }

  get total(): Money {
    return this.subtotal.add(this.shippingAmount);
  }

  withPaymentStatus(next: PaymentStatus): Order {
    assertPaymentTransition(this.paymentStatus, next);
    return new Order({ ...this, paymentStatus: next });
  }

  withFulfillmentStatus(next: FulfillmentStatus): Order {
    assertFulfillmentTransition(this.paymentStatus, this.fulfillmentStatus, next);
    return new Order({ ...this, fulfillmentStatus: next });
  }
}
