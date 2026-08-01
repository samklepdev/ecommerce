export type PaymentStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'awaiting_confirmation'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type FulfillmentStatus =
  | 'unfulfilled'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export class IllegalStatusTransitionError extends Error {
  constructor(kind: string, from: string, to: string) {
    super(`Illegal ${kind} transition: ${from} -> ${to}`);
    this.name = 'IllegalStatusTransitionError';
  }
}

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  // `awaiting_confirmation` and `paid` are reachable from here because a
  // `pending` order can already have a live payment address against it:
  // `StartCheckout` derives the address and *then* records
  // `awaiting_payment`, so a crash between the two leaves exactly that state —
  // with the BIP21 URI already returned to the customer.
  //
  // It used to be unreachable only by accident: a `pending` order had no
  // payment deadline, and every query that finds work filters on one. Now
  // that the deadline is stamped at order creation the watcher does see
  // these, and without these two edges `ConfirmPayment` would throw on every
  // pass — an error loop every 45 seconds with the customer's money stranded
  // behind it.
  pending: ['awaiting_payment', 'awaiting_confirmation', 'paid', 'failed', 'expired', 'cancelled'],
  // `paid` is reachable directly too: confirmations can already meet the
  // threshold the first time a watcher pass observes the address, without an
  // intermediate awaiting_confirmation pass ever having been recorded.
  awaiting_payment: ['awaiting_confirmation', 'paid', 'failed', 'expired', 'cancelled'],
  // No `cancelled` here — once the chain has seen something, a customer can
  // no longer cancel (see UI gating in OrderDetailView).
  awaiting_confirmation: ['paid', 'failed', 'expired'],
  // Terminal. There is no refund mechanism in this app — a refund, if one ever
  // happens, is an out-of-band on-chain send, and recording it as a payment
  // status would put a transaction we never made into the record that decides
  // revenue. `CancelOrderFulfillment` is how a paid order the shop won't fulfil
  // gets closed, and it deliberately leaves payment alone.
  paid: [],
  failed: [],
  // Narrow recovery path: the chain-watcher's polling grace window and the
  // order-expiry check's window are kept in sync (see PAYMENT_EXPIRY_GRACE_MS)
  // specifically to avoid needing this, but it stays as a safety net — the
  // chain is the source of truth, not our own expiry bookkeeping, so a
  // pass that discovers a genuinely confirmed payment for an
  // already-expired order must still be able to record it.
  expired: ['paid'],
  // Same rationale as `expired`: a customer can cancel before paying, but the
  // BTC address was already derived and handed out — if a payment shows up
  // anyway, it must still be recordable rather than stranded.
  cancelled: ['paid'],
};

/** Fulfillment only ever starts once payment has reached `paid`. */
const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  unfulfilled: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  // `cancelled` from `shipped` covers a parcel lost in transit. Without it the
  // only way out is `delivered`, and recording a lost parcel as delivered puts
  // a lie in the durable record — the one place that has to stay true.
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

/** Only pre-payment orders can be cancelled by the customer — once the
 * chain has seen anything (`awaiting_confirmation` onward), cancellation
 * is no longer offered (see PAYMENT_TRANSITIONS above: no `cancelled`
 * transition exists past `awaiting_payment`). Shared by every UI surface
 * that offers a cancel action, so the rule can't drift between them. */
export function isOrderCancellable(status: PaymentStatus): boolean {
  return status === 'pending' || status === 'awaiting_payment';
}

/**
 * Whether an admin may still change what the order *is*: its lines, and so
 * the amount owed.
 *
 * Deliberately the same window as cancellation, and for the same reason.
 * Past `awaiting_payment` the chain has seen money, and money that arrived
 * against one total can't be reconciled against another by editing a row —
 * that needs someone to decide what to do about the difference, not a side
 * effect of a form.
 *
 * Contact details (email, shipping address) are governed separately by
 * `isOrderContactEditable`: correcting a typo'd address never changes what
 * is owed.
 */
export function areOrderLinesEditable(status: PaymentStatus): boolean {
  return status === 'pending' || status === 'awaiting_payment';
}

/**
 * Whether the customer's contact details can still be corrected. Allowed for
 * any order that hasn't shipped — a typo'd shipping address is worth fixing
 * right up until the parcel moves, and fixing it costs nothing because it
 * doesn't touch the total.
 *
 * Keyed on fulfillment alone: payment status has no bearing on whether an
 * address is worth correcting, and the one payment status that used to block
 * it (`refunded`) no longer exists.
 */
export function isOrderContactEditable(
  _paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
): boolean {
  return fulfillmentStatus === 'unfulfilled' || fulfillmentStatus === 'processing';
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!PAYMENT_TRANSITIONS[from].includes(to)) {
    throw new IllegalStatusTransitionError('payment', from, to);
  }
}

export function assertFulfillmentTransition(
  paymentStatus: PaymentStatus,
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): void {
  if (paymentStatus !== 'paid' && to !== 'cancelled') {
    throw new IllegalStatusTransitionError('fulfillment', from, `${to} (payment not yet paid)`);
  }
  if (!FULFILLMENT_TRANSITIONS[from].includes(to)) {
    throw new IllegalStatusTransitionError('fulfillment', from, to);
  }
}
