import { describe, expect, it } from 'vitest';

import { shouldRefreshOnStatusChange } from './bitcoin-checkout-status';

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
