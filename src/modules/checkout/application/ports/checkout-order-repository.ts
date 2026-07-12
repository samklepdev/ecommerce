import type { Money } from '@/shared/domain/money';

export interface CheckoutOrderRepository {
  repriceAndGetTotal(orderId: string): Promise<Money>;
  markAwaitingPayment(
    orderId: string,
    reference: string,
    paymentWindowExpiresAt: Date,
  ): Promise<void>;
}
