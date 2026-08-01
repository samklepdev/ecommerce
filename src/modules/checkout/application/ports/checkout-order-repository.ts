import type { Money } from '@/shared/domain/money';

export interface CheckoutOrderRepository {
  repriceAndGetTotal(orderId: string): Promise<Money>;
  /**
   * `paymentDeadlineAt` is set once and never moved: it's how long the
   * customer has to pay, and a re-quote must not silently extend it into an
   * open-ended order.
   *
   * Compare-and-set, like every other payment-status write: applies only if
   * the order is still `pending` or `awaiting_payment`, and reports whether it
   * did. Unguarded, a second caller — a resume-payment button, an admin
   * re-issuing an invoice — could write `awaiting_payment` over `paid`, and
   * because the intent would be `confirmed` the order would then never appear
   * in `listWatchable` again: unwatched until it expired, with the customer's
   * money already spent.
   */
  markAwaitingPayment(
    orderId: string,
    reference: string,
    paymentWindowExpiresAt: Date,
    paymentDeadlineAt: Date,
  ): Promise<boolean>;
}
