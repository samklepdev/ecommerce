import type { Money } from '@/shared/domain/money';

export interface CheckoutOrderRepository {
  repriceAndGetTotal(orderId: string): Promise<Money>;
  /**
   * `paymentDeadlineAt` is set once and never moved: it's how long the
   * customer has to pay, and a re-quote must not silently extend it into an
   * open-ended order.
   */
  markAwaitingPayment(
    orderId: string,
    reference: string,
    paymentWindowExpiresAt: Date,
    paymentDeadlineAt: Date,
  ): Promise<void>;
}
