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
  /** The order_lines row id — what an admin edit targets. */
  id: string;
  productId: string;
  productName: string;
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
  /**
   * When the chain first showed money against this order — the moment the
   * `AWAITING_CONFIRMATION_WINDOW_HOURS` clock started.
   *
   * Exposed because that clock is the sharpest one in the system: when it runs
   * out a part-paying customer's order goes to `failed`, which is terminal,
   * and with no refund mechanism their money is gone. Telling them the
   * deadline is the difference between a top-up and a loss.
   */
  awaitingConfirmationSince: Date | null;
}

/** Narrows an admin order list. Shared by the list and its count so the two
 * can never drift apart and report different totals. */
export interface AdminOrderFilter {
  email?: string;
}

/** The three all-orders numbers the admin dashboard shows. Counted in one
 * query rather than by scanning every order in the process — which is what
 * the dashboard used to do for each of them. */
export interface AdminOrderCounts {
  awaitingConfirmation: number;
  recovered: number;
  placedInWindow: number;
}

export interface OrderHistoryRepository {
  /** One page, newest first. Paged in SQL — a customer with years of orders
   * shouldn't pull all of them into memory to show ten. */
  listByCustomer(userId: string, limit: number, offset: number): Promise<OrderListItem[]>;
  countByCustomer(userId: string): Promise<number>;
  /** Admin-only — every order regardless of customer, optionally narrowed
   * by an exact-or-partial customer email match. One page, newest first. */
  listAllForAdmin(filter: AdminOrderFilter, limit: number, offset: number): Promise<OrderListItem[]>;
  countAllForAdmin(filter: AdminOrderFilter): Promise<number>;
  getAdminOrderCounts(window: { since: Date; until: Date }): Promise<AdminOrderCounts>;
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
