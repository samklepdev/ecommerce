import { describe, expect, it } from 'vitest';

import { shouldRefreshOnStatusChange, toWidgetStatus } from './bitcoin-checkout-status';

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
    expect(shouldRefreshOnStatusChange('paid', 'refunded')).toBe(true);
  });
});

describe('toWidgetStatus', () => {
  it('maps the pre-settlement states', () => {
    expect(toWidgetStatus('pending')).toBe('awaiting');
    expect(toWidgetStatus('awaiting_payment')).toBe('awaiting');
    expect(toWidgetStatus('awaiting_confirmation')).toBe('confirming');
  });

  // Each terminal state keeps its own identity: telling a refunded customer
  // their payment window merely expired would be a lie about their money.
  it('keeps every terminal state distinct', () => {
    expect(toWidgetStatus('paid')).toBe('paid');
    expect(toWidgetStatus('failed')).toBe('failed');
    expect(toWidgetStatus('expired')).toBe('expired');
    expect(toWidgetStatus('cancelled')).toBe('cancelled');
    expect(toWidgetStatus('refunded')).toBe('refunded');
  });
});
