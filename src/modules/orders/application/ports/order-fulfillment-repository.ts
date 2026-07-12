import type { FulfillmentStatus, PaymentStatus } from '@/modules/orders/domain/order-status';

export interface OrderFulfillmentRepository {
  getPaymentStatus(orderId: string): Promise<PaymentStatus | null>;
  getFulfillmentStatus(orderId: string): Promise<FulfillmentStatus | null>;
  setFulfillmentStatus(orderId: string, status: FulfillmentStatus): Promise<void>;
}
