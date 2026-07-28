import { describe, expect, it } from 'vitest';
import {
  assertFulfillmentTransition,
  assertPaymentTransition,
  isOrderCancellable,
  areOrderLinesEditable,
  isOrderContactEditable,
  IllegalStatusTransitionError,
  type FulfillmentStatus,
  type PaymentStatus,
} from './order-status';

const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'awaiting_payment',
  'awaiting_confirmation',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'refunded',
];

const LEGAL_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['awaiting_payment', 'failed', 'expired', 'cancelled'],
  awaiting_payment: ['awaiting_confirmation', 'paid', 'failed', 'expired', 'cancelled'],
  // No `cancelled` here — once the chain has seen something, a customer can
  // no longer cancel.
  awaiting_confirmation: ['paid', 'failed', 'expired'],
  paid: ['refunded'],
  failed: [],
  // Narrow recovery path: a chain-watcher pass can discover a genuinely
  // confirmed payment for an order that was already (mistakenly) expired —
  // the chain is the source of truth, not our own expiry bookkeeping.
  expired: ['paid'],
  // Same rationale as `expired` — a customer-cancelled order's BTC address
  // was already handed out, so a late payment must still be recordable.
  cancelled: ['paid'],
  refunded: [],
};

describe('assertPaymentTransition', () => {
  for (const from of PAYMENT_STATUSES) {
    for (const to of LEGAL_PAYMENT_TRANSITIONS[from]) {
      it(`allows ${from} -> ${to}`, () => {
        expect(() => assertPaymentTransition(from, to)).not.toThrow();
      });
    }

    for (const to of PAYMENT_STATUSES) {
      if (LEGAL_PAYMENT_TRANSITIONS[from].includes(to)) continue;
      it(`rejects ${from} -> ${to}`, () => {
        expect(() => assertPaymentTransition(from, to)).toThrow(IllegalStatusTransitionError);
      });
    }
  }
});

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'unfulfilled',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

const LEGAL_FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unfulfilled: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

describe('assertFulfillmentTransition', () => {
  for (const from of FULFILLMENT_STATUSES) {
    for (const to of LEGAL_FULFILLMENT_TRANSITIONS[from]) {
      it(`allows ${from} -> ${to} once payment is paid`, () => {
        expect(() => assertFulfillmentTransition('paid', from, to)).not.toThrow();
      });
    }

    for (const to of FULFILLMENT_STATUSES) {
      if (LEGAL_FULFILLMENT_TRANSITIONS[from].includes(to)) continue;
      it(`rejects ${from} -> ${to} even when payment is paid`, () => {
        expect(() => assertFulfillmentTransition('paid', from, to)).toThrow(
          IllegalStatusTransitionError,
        );
      });
    }
  }

  it('rejects an otherwise-legal transition when payment is not yet paid and the target is not cancelled', () => {
    expect(() => assertFulfillmentTransition('awaiting_payment', 'unfulfilled', 'processing')).toThrow(
      IllegalStatusTransitionError,
    );
  });

  it('allows cancelling before payment is paid', () => {
    expect(() =>
      assertFulfillmentTransition('awaiting_payment', 'unfulfilled', 'cancelled'),
    ).not.toThrow();
  });
});

describe('isOrderCancellable', () => {
  it('is true before any money has been sent', () => {
    expect(isOrderCancellable('pending')).toBe(true);
    expect(isOrderCancellable('awaiting_payment')).toBe(true);
  });

  it('is false once the chain has seen anything, or in any terminal state', () => {
    expect(isOrderCancellable('awaiting_confirmation')).toBe(false);
    expect(isOrderCancellable('paid')).toBe(false);
    expect(isOrderCancellable('failed')).toBe(false);
    expect(isOrderCancellable('expired')).toBe(false);
    expect(isOrderCancellable('cancelled')).toBe(false);
    expect(isOrderCancellable('refunded')).toBe(false);
  });
});

describe('areOrderLinesEditable', () => {
  it('is true only while nothing has been seen on chain', () => {
    expect(areOrderLinesEditable('pending')).toBe(true);
    expect(areOrderLinesEditable('awaiting_payment')).toBe(true);
  });

  // Editing what is owed after money arrived against the old total doesn't
  // reconcile anything — it just makes the two numbers disagree silently.
  it('is false from awaiting_confirmation onward', () => {
    expect(areOrderLinesEditable('awaiting_confirmation')).toBe(false);
    expect(areOrderLinesEditable('paid')).toBe(false);
    expect(areOrderLinesEditable('failed')).toBe(false);
    expect(areOrderLinesEditable('expired')).toBe(false);
    expect(areOrderLinesEditable('cancelled')).toBe(false);
    expect(areOrderLinesEditable('refunded')).toBe(false);
  });

  it('matches the cancellation window exactly', () => {
    const statuses: PaymentStatus[] = [
      'pending',
      'awaiting_payment',
      'awaiting_confirmation',
      'paid',
      'failed',
      'expired',
      'cancelled',
      'refunded',
    ];
    for (const status of statuses) {
      expect(areOrderLinesEditable(status)).toBe(isOrderCancellable(status));
    }
  });
});

describe('isOrderContactEditable', () => {
  // A typo'd shipping address is worth fixing right up until the parcel
  // moves, and fixing it never changes what is owed.
  it('allows a correction on a paid order that has not shipped', () => {
    expect(isOrderContactEditable('paid', 'unfulfilled')).toBe(true);
    expect(isOrderContactEditable('paid', 'processing')).toBe(true);
  });

  it('allows a correction before payment too', () => {
    expect(isOrderContactEditable('awaiting_payment', 'unfulfilled')).toBe(true);
  });

  it('stops once the parcel is moving', () => {
    expect(isOrderContactEditable('paid', 'shipped')).toBe(false);
    expect(isOrderContactEditable('paid', 'delivered')).toBe(false);
    expect(isOrderContactEditable('paid', 'cancelled')).toBe(false);
  });

  it('stops on a refunded order — that record is closed', () => {
    expect(isOrderContactEditable('refunded', 'unfulfilled')).toBe(false);
  });
});
