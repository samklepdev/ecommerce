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
  customerEmail: string;
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
  /** Admin-only — every order regardless of customer, optionally narrowed
   * by an exact-or-partial customer email match. */
  listAllForAdmin(params?: { email?: string }): Promise<OrderListItem[]>;
  /** Scoped by userId in the query itself, not fetch-then-check — a
   * mismatched userId returns null, never another customer's order. */
  findDetailById(orderId: string, userId: string): Promise<OrderDetail | null>;
  /** Unscoped — the order id itself (a randomUUID, effectively unguessable)
   * is the access capability, matching the existing unauthenticated
   * `/api/orders/[id]/status` route. Used for guest order lookup and
   * anything else that only has an order id, no user context. */
  findById(orderId: string): Promise<OrderDetail | null>;
}
