import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

export interface OrderFulfillmentRepository {
  getPaymentStatus(orderId: string): Promise<PaymentStatus | null>;
  getFulfillmentStatus(orderId: string): Promise<FulfillmentStatus | null>;
  /**
   * Compare-and-set: applies only if the order is still in `expectedFrom`, and
   * reports whether it did. Every caller reads the status, awaits something,
   * then writes — so without the guard the later of two concurrent writes wins
   * regardless of whether its transition still makes sense.
   */
  setFulfillmentStatus(
    orderId: string,
    status: FulfillmentStatus,
    expectedFrom: FulfillmentStatus,
  ): Promise<boolean>;
}
