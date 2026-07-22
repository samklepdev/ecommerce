import type { Order } from '@/modules/orders/domain/order';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

export interface OrderRepository {
  create(order: Order): Promise<void>;
}

export interface ConfirmPaymentOrderRepository {
  getPaymentStatus(orderId: string): Promise<PaymentStatus | null>;
  setPaymentStatus(orderId: string, status: PaymentStatus): Promise<void>;
  /** Durable, admin-visible trace of a cancelled/expired -> paid recovery —
   * set once, never cleared. */
  recordPaymentRecovery(orderId: string, from: 'expired' | 'cancelled'): Promise<void>;
}
