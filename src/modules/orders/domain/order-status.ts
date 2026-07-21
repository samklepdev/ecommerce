export type PaymentStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'awaiting_confirmation'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded';

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
  pending: ['awaiting_payment', 'failed', 'expired'],
  // `paid` is reachable directly too: confirmations can already meet the
  // threshold the first time a watcher pass observes the address, without an
  // intermediate awaiting_confirmation pass ever having been recorded.
  awaiting_payment: ['awaiting_confirmation', 'paid', 'failed', 'expired'],
  awaiting_confirmation: ['paid', 'failed', 'expired'],
  paid: ['refunded'],
  failed: [],
  // Narrow recovery path: the chain-watcher's polling grace window and the
  // order-expiry check's window are kept in sync (see PAYMENT_EXPIRY_GRACE_MS)
  // specifically to avoid needing this, but it stays as a safety net — the
  // chain is the source of truth, not our own expiry bookkeeping, so a
  // pass that discovers a genuinely confirmed payment for an
  // already-expired order must still be able to record it.
  expired: ['paid'],
  refunded: [],
};

/** Fulfillment only ever starts once payment has reached `paid`. */
const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  unfulfilled: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

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
