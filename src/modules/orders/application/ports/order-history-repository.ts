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
  /** Set when ConfirmPayment recovered this order from expired/cancelled
   * back to paid — admin-only signal, not shown on customer-facing pages. */
  paymentRecoveredFrom: 'expired' | 'cancelled' | null;
}

export interface OrderDetailLine {
  variantId: string;
  sku: string;
  quantity: number;
  unitAmountMinor: number;
  /** The product's primary image at read time — not snapshotted, so it
   * reflects the current product image, not what it looked like when the
   * order was placed. Null if the product has no image or was deleted. */
  imageUrl: string | null;
}

export interface OrderDetail extends OrderListItem {
  shippingAddress: OrderShippingAddress | null;
  shippingAmountMinor: number;
  lines: OrderDetailLine[];
  /** Internal ops notes — admin-only, never rendered for customers even
   * though it travels on the same read model as the public order view. */
  notes: string | null;
  discountAmountMinor: number;
  couponCode: string | null;
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
  /** Exact (case-insensitive) email match — used to resend order-confirmation
   * emails to a guest who lost their order link. Never exposed directly to
   * the customer; only used internally to drive a resend. */
  findOrderIdsByEmail(email: string): Promise<string[]>;
}
