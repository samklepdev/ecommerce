import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

export interface OrderShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface OrderListItem {
  id: string;
  createdAt: Date;
  currency: string;
  amountMinor: number;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
}

export interface OrderDetailLine {
  sku: string;
  quantity: number;
  unitAmountMinor: number;
}

export interface OrderDetail extends OrderListItem {
  shippingAddress: OrderShippingAddress | null;
  lines: OrderDetailLine[];
}

export interface OrderHistoryRepository {
  listByCustomer(userId: string): Promise<OrderListItem[]>;
  /** Scoped by userId in the query itself, not fetch-then-check — a
   * mismatched userId returns null, never another customer's order. */
  findDetailById(orderId: string, userId: string): Promise<OrderDetail | null>;
}
