import type { PaymentStatus } from '@/modules/orders/domain/order-status';

export type WidgetStatus =
  | 'awaiting'
  | 'confirming'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';


/** Domain payment status -> the states `BitcoinCheckout` renders. `failed`,
 * `expired` and `cancelled` each keep their own state — collapsing them would
 * tell a customer whose order failed that their payment window merely expired,
 * or tell someone who cancelled that something went wrong.
 *
 * Shared by the status route (what the widget polls) and the order pages
 * (what the widget first paints), so a confirmed order never renders as
 * "Awaiting payment" for the moment before the first poll lands. */
const WIDGET_STATUS: Record<PaymentStatus, WidgetStatus> = {
  pending: 'awaiting',
  awaiting_payment: 'awaiting',
  awaiting_confirmation: 'confirming',
  paid: 'paid',
  failed: 'failed',
  expired: 'expired',
  cancelled: 'cancelled',
};

export function toWidgetStatus(status: PaymentStatus): WidgetStatus {
  return WIDGET_STATUS[status];
}

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
