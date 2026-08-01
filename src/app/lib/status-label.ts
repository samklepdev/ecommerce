import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

/**
 * Customer-facing wording for an order's status.
 *
 * Both customer surfaces used to render the raw enum — a shopper saw
 * `awaiting_confirmation` and `unfulfilled` in a badge. Those are internal
 * identifiers: snake_case, written for the state machine, and in at least one
 * case actively misleading. "Awaiting confirmation" reads like the shop is
 * waiting on itself, when what it actually means is either "your payment is
 * getting buried in blocks" or "you still owe us money" — and the customer has
 * no way to tell which.
 *
 * These say what happened in the second person, and never invent certainty the
 * system doesn't have. Admin surfaces deliberately keep the raw values: an
 * operator wants the state machine's own vocabulary, because that's what the
 * logs, the audit trail and this codebase all use.
 */
const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  // Pre-checkout. A customer rarely sees this — the order exists but no address
  // has been derived yet.
  pending: 'Not paid yet',
  awaiting_payment: 'Awaiting your payment',
  // Deliberately vague about *why*, because this one status covers two very
  // different situations (short payment vs. shallow confirmations) and the
  // detail panel is what distinguishes them. Better vague than confidently wrong.
  awaiting_confirmation: 'Payment received — checking',
  paid: 'Paid',
  failed: 'Payment failed',
  expired: 'Payment window closed',
  cancelled: 'Cancelled',
};

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  // "Unfulfilled" sounds like a failure to a customer; it just means not packed
  // yet, which for a paid order is the normal next step.
  unfulfilled: 'Not dispatched yet',
  processing: 'Being prepared',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_LABELS[status];
}

export function fulfillmentStatusLabel(status: FulfillmentStatus): string {
  return FULFILLMENT_LABELS[status];
}
