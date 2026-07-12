import type { Order } from '@/modules/orders/domain/order';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

export interface OrderRepository {
  create(order: Order): Promise<void>;
}

export interface ConfirmPaymentOrderRepository {
  getPaymentStatus(orderId: string): Promise<PaymentStatus | null>;
  setPaymentStatus(orderId: string, status: PaymentStatus): Promise<void>;
}
