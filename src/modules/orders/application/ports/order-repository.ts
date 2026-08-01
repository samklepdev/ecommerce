import type { Order } from '@/modules/orders/domain/order';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';

export interface OrderRepository {
  /**
   * `paymentDeadlineAt` is stamped here, at creation, rather than when
   * checkout starts. `StartCheckout` is a separate call, and when it failed
   * the order was written with a NULL deadline — which every query that finds
   * work filters on with `<` or `>`, and NULL satisfies neither. Such an order
   * was invisible to expiry and to the watcher at once: it could never close,
   * and nobody would ever look at its address.
   */
  create(order: Order, paymentDeadlineAt: Date): Promise<void>;
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
