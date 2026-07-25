export type WidgetStatus =
  | 'awaiting'
  | 'confirming'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

/**
 * Whether `BitcoinCheckout`'s poller should force a refresh of the
 * server-rendered page around it. The page's own view of the order
 * (status badge, whether the Cancel button is offered) is only as fresh
 * as its last full render, so it goes stale once payment status advances
 * while the widget stays mounted — refreshing on every observed change
 * keeps it in sync.
 *
 * `lastStatus` is `null` on the widget's first poll response: that call
 * is just confirming the page's initial render, not reacting to a change,
 * so it must not trigger a refresh.
 */
export function shouldRefreshOnStatusChange(
  lastStatus: WidgetStatus | null,
  nextStatus: WidgetStatus,
): boolean {
  return lastStatus !== null && lastStatus !== nextStatus;
}
