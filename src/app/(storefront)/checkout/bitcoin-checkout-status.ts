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

/**
 * What the widget's confirming panel should say.
 *
 * Extracted from the JSX because the wrong answer here costs a customer real
 * money and there was no way to test it in place. The failure: the widget
 * seeded its state with `requiredConfirmations: 0, underpaid: false` and
 * swallowed failed polls (`if (!res.ok) return`), so an underpaid order whose
 * status call never succeeded rendered
 *
 *   "Payment seen, waiting for confirmations… (0 of 0). No further payment is
 *   needed."
 *
 * — with no balance, no address and no QR, at a customer who owed money and
 * had 48 hours to send it. Seeding from the server's own figures fixes the
 * common case; `stale` covers the rest, because "we can't reach the server" and
 * "nothing more is needed" must never look alike.
 */
export type ConfirmingMessage =
  | { kind: 'stale' }
  | { kind: 'in-mempool' }
  | { kind: 'confirming'; confirmations: number; requiredConfirmations: number };

export function confirmingMessage(input: {
  confirmedSats: number;
  pendingSats: number;
  confirmations: number;
  requiredConfirmations: number;
  /** No status response has landed yet, or the last few failed. */
  stale: boolean;
}): ConfirmingMessage {
  // Checked first: with no fresh data every other branch is a guess, and the
  // reassuring one ("no further payment is needed") is the dangerous guess.
  if (input.stale) return { kind: 'stale' };

  // In a block is not the same as in the mempool, and "0 of 3 confirmations"
  // reads as nothing having happened at the moment the customer most wants to
  // hear their money arrived.
  if (input.confirmedSats === 0 && input.pendingSats > 0) return { kind: 'in-mempool' };

  return {
    kind: 'confirming',
    confirmations: input.confirmations,
    requiredConfirmations: input.requiredConfirmations,
  };
}
