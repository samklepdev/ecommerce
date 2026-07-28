import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';
import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';
import type { BadgeTone } from '@/components/ui/Badge';

/**
 * One colour per state, not one colour per outcome.
 *
 * These previously grouped by sentiment — failed/expired/cancelled all read
 * as the same red, pending and awaiting_payment as the same grey — which is
 * fine in prose and useless in a column of orders, where telling "the
 * customer never paid" from "we refused it" from "they cancelled" is the
 * entire reason to look. Every payment state is now visually distinct:
 *
 *   pending               grey outline   nothing has happened yet
 *   awaiting_payment      amber          waiting on the customer
 *   awaiting_confirmation blue           on-chain, waiting on depth
 *   paid                  green          settled
 *   refunded              violet         money went back
 *   failed                red            we refused it
 *   expired               slate          the window closed
 *   cancelled             red outline    stopped deliberately, not a failure
 *
 * The `switch` is exhaustive on purpose (no `default`): adding a state to
 * the machine should fail the typecheck here rather than silently render
 * grey.
 */
export function paymentStatusTone(status: PaymentStatus): BadgeTone {
  switch (status) {
    case 'pending':
      return 'neutral';
    case 'awaiting_payment':
      return 'warning';
    case 'awaiting_confirmation':
      return 'info';
    case 'paid':
      return 'success';
    case 'refunded':
      return 'violet';
    case 'failed':
      return 'danger';
    case 'expired':
      return 'slate';
    case 'cancelled':
      return 'dangerSoft';
  }
}

/** Same rule as payments: shipped and delivered are different facts, and an
 * ops queue is scanned for exactly that difference. */
export function fulfillmentStatusTone(status: FulfillmentStatus): BadgeTone {
  switch (status) {
    case 'unfulfilled':
      return 'neutral';
    case 'processing':
      return 'info';
    case 'shipped':
      return 'accent';
    case 'delivered':
      return 'success';
    case 'cancelled':
      return 'dangerSoft';
  }
}

export function supplierOrderStatusTone(status: SupplierOrderStatus): BadgeTone {
  switch (status) {
    case 'needs_ordering':
      return 'neutral';
    case 'ordered':
      return 'info';
    case 'shipped':
      return 'success';
    case 'cancelled':
      return 'dangerSoft';
  }
}
