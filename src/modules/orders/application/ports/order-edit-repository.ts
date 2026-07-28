import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';
import type { OrderShippingAddress } from '@/modules/orders/application/ports/order-history-repository';

export interface EditableOrderLine {
  /** Null for a line that doesn't exist yet — the repository assigns the id
   * when it inserts. */
  id: string | null;
  productId: string;
  sku: string;
  quantity: number;
  unitAmountMinor: number;
}

/** Everything an edit needs to decide what's allowed and to recompute the
 * total. Deliberately not the `Order` aggregate: this is a read model for
 * one operation, not the whole order. */
export interface EditableOrder {
  id: string;
  currency: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  shippingAmountMinor: number;
  discountAmountMinor: number;
  lines: EditableOrderLine[];
}

export interface OrderContactChange {
  customerEmail?: string;
  shippingAddress?: OrderShippingAddress;
}

export interface OrderEditRepository {
  getEditable(orderId: string): Promise<EditableOrder | null>;
  updateContact(orderId: string, change: OrderContactChange): Promise<void>;
  /**
   * The order's new line set and the total that goes with it, written
   * together. One transaction on purpose: an order whose `amount_minor`
   * disagrees with its lines is an order that charges the wrong amount, and
   * a partial write here is exactly how that happens.
   */
  replaceLines(orderId: string, lines: EditableOrderLine[], amountMinor: number): Promise<void>;
  /** Pushes the order's payment window out after a re-quote, so
   * `ExpireStaleCheckouts` doesn't expire an order against the old one. */
  setPaymentWindow(orderId: string, expiresAt: Date): Promise<void>;
}
