import { describe, expect, it } from 'vitest';

import {
  confirmingMessage,
  shouldRefreshOnStatusChange,
  toWidgetStatus,
} from './bitcoin-checkout-status';

describe('shouldRefreshOnStatusChange', () => {
  it('does not refresh on the widget\'s first poll response', () => {
    expect(shouldRefreshOnStatusChange(null, 'awaiting')).toBe(false);
  });

  it('does not refresh when the status is unchanged', () => {
    expect(shouldRefreshOnStatusChange('awaiting', 'awaiting')).toBe(false);
    expect(shouldRefreshOnStatusChange('confirming', 'confirming')).toBe(false);
  });

  it('refreshes when payment moves from awaiting to confirming', () => {
    expect(shouldRefreshOnStatusChange('awaiting', 'confirming')).toBe(true);
  });

  it('refreshes when payment reaches paid, straight from awaiting or via confirming', () => {
    expect(shouldRefreshOnStatusChange('awaiting', 'paid')).toBe(true);
    expect(shouldRefreshOnStatusChange('confirming', 'paid')).toBe(true);
  });

  it('refreshes on any other terminal transition', () => {
    expect(shouldRefreshOnStatusChange('awaiting', 'expired')).toBe(true);
    expect(shouldRefreshOnStatusChange('awaiting', 'cancelled')).toBe(true);
    expect(shouldRefreshOnStatusChange('confirming', 'failed')).toBe(true);
  });
});

describe('toWidgetStatus', () => {
  it('maps the pre-settlement states', () => {
    expect(toWidgetStatus('pending')).toBe('awaiting');
    expect(toWidgetStatus('awaiting_payment')).toBe('awaiting');
    expect(toWidgetStatus('awaiting_confirmation')).toBe('confirming');
  });

  // Each terminal state keeps its own identity: telling a customer
  // their payment window merely expired would be a lie about their money.
  it('keeps every terminal state distinct', () => {
    expect(toWidgetStatus('paid')).toBe('paid');
    expect(toWidgetStatus('failed')).toBe('failed');
    expect(toWidgetStatus('expired')).toBe('expired');
    expect(toWidgetStatus('cancelled')).toBe('cancelled');
  });
});

describe('confirmingMessage', () => {
  const fresh = {
    confirmedSats: 100_000,
    pendingSats: 0,
    confirmations: 1,
    requiredConfirmations: 3,
    stale: false,
  };

  it('reports progress toward the threshold', () => {
    expect(confirmingMessage(fresh)).toEqual({
      kind: 'confirming',
      confirmations: 1,
      requiredConfirmations: 3,
    });
  });

  it('says the payment is in the mempool rather than "0 of 3"', () => {
    // "0 of 3 confirmations" is true and reads as nothing having happened, at
    // the moment the customer most wants to hear their money arrived.
    expect(
      confirmingMessage({ ...fresh, confirmedSats: 0, pendingSats: 100_000, confirmations: 0 }),
    ).toEqual({ kind: 'in-mempool' });
  });

  /**
   * The one that cost money. The widget seeded `requiredConfirmations: 0,
   * underpaid: false` and swallowed failed polls, so an underpaid order whose
   * status call never landed told the customer "(0 of 0). No further payment
   * is needed" — with no balance, no address and no QR — while they owed money
   * and had 48 hours to send it.
   */
  it('never reports progress it has not actually seen', () => {
    expect(
      confirmingMessage({
        confirmedSats: 0,
        pendingSats: 0,
        confirmations: 0,
        requiredConfirmations: 0,
        stale: true,
      }),
    ).toEqual({ kind: 'stale' });
  });

  it('prefers staleness over any reassuring reading of old numbers', () => {
    // Even numbers that look complete are a guess when they are not fresh.
    expect(
      confirmingMessage({ ...fresh, confirmations: 3, stale: true }),
    ).toEqual({ kind: 'stale' });
  });

  it('treats a fully-confirmed reading as progress, not mempool', () => {
    expect(
      confirmingMessage({ ...fresh, confirmedSats: 100_000, pendingSats: 50_000, confirmations: 3 }),
    ).toEqual({ kind: 'confirming', confirmations: 3, requiredConfirmations: 3 });
  });
});
