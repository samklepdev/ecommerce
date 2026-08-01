import { describe, expect, it } from 'vitest';

import { fulfillmentStatusLabel, paymentStatusLabel } from './status-label';
import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'awaiting_payment',
  'awaiting_confirmation',
  'paid',
  'failed',
  'expired',
  'cancelled',
];

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'unfulfilled',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

describe('customer-facing status labels', () => {
  it('has a label for every payment status', () => {
    // Exhaustive on purpose: a status added to the machine without a label here
    // would render `undefined` in a badge on a customer's order page.
    for (const status of PAYMENT_STATUSES) {
      expect(paymentStatusLabel(status), status).toBeTruthy();
    }
  });

  it('has a label for every fulfillment status', () => {
    for (const status of FULFILLMENT_STATUSES) {
      expect(fulfillmentStatusLabel(status), status).toBeTruthy();
    }
  });

  it('never leaks an internal identifier to a customer', () => {
    // The actual bug this replaced: raw enums rendered straight into a badge.
    // No label should contain an underscore or be the enum value itself.
    for (const status of PAYMENT_STATUSES) {
      const label = paymentStatusLabel(status);
      expect(label, status).not.toContain('_');
      expect(label, status).not.toBe(status);
    }
    for (const status of FULFILLMENT_STATUSES) {
      const label = fulfillmentStatusLabel(status);
      expect(label, status).not.toContain('_');
      expect(label, status).not.toBe(status);
    }
  });

  it('does not claim a short payment is merely being confirmed', () => {
    // `awaiting_confirmation` covers both "buried in blocks" and "you still owe
    // money". The label must not assert the happy one — the detail panel is what
    // distinguishes them.
    const label = paymentStatusLabel('awaiting_confirmation');
    expect(label.toLowerCase()).not.toContain('confirmed');
    expect(label.toLowerCase()).not.toContain('complete');
  });

  it('does not describe an undispatched paid order as a failure', () => {
    expect(fulfillmentStatusLabel('unfulfilled').toLowerCase()).not.toContain('unfulfilled');
  });
});
