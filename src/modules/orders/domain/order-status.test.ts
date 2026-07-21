import { describe, expect, it } from 'vitest';
import {
  assertFulfillmentTransition,
  assertPaymentTransition,
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
  'refunded',
];

const LEGAL_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['awaiting_payment', 'failed', 'expired'],
  awaiting_payment: ['awaiting_confirmation', 'paid', 'failed', 'expired'],
  awaiting_confirmation: ['paid', 'failed', 'expired'],
  paid: ['refunded'],
  failed: [],
  // Narrow recovery path: a chain-watcher pass can discover a genuinely
  // confirmed payment for an order that was already (mistakenly) expired —
  // the chain is the source of truth, not our own expiry bookkeeping.
  expired: ['paid'],
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
