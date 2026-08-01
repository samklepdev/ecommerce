import type { Order } from '@/modules/orders/domain/order';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

export interface OrderRepository {
  create(order: Order): Promise<void>;
}

export interface ConfirmPaymentOrderRepository {
  getPaymentStatus(orderId: string): Promise<PaymentStatus | null>;
  /**
   * Compare-and-set. Applies only if the row is still in `expectedFrom`, and
   * returns whether it did.
   *
   * Every caller reads the status, decides, then writes — so an unguarded
   * UPDATE is a TOCTOU race with whatever else touches the order. That is not
   * theoretical here: an admin failing an order while the watcher confirms a
   * payment could write `failed` over `paid`, and since `failed` is terminal
   * and no refund mechanism exists, the customer's money is simply gone.
   *
   * `expectedFrom` is the status the caller based its decision on, so the write
   * either applies to the state that was reasoned about or it doesn't apply.
   */
  setPaymentStatus(
    orderId: string,
    status: PaymentStatus,
    expectedFrom: PaymentStatus,
  ): Promise<boolean>;
  /** Durable, admin-visible trace of a cancelled/expired -> paid recovery —
   * set once, never cleared. */
  recordPaymentRecovery(orderId: string, from: 'expired' | 'cancelled'): Promise<void>;
}
