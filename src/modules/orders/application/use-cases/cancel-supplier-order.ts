import type { UseCase } from '@/shared/application/use-case';
import { assertFulfillmentTransition } from '@/modules/orders/domain/order-status';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

export interface CancelSupplierOrderInput {
  supplierOrderId: string;
  orderId: string;
}

export interface CancelSupplierOrderResult {
  cancelled: boolean;
}

/**
 * Cancels one supplier order, and — once every supplier order tied to the
 * parent customer order is cancelled (nothing left that will ever ship) —
 * advances the order's own fulfillment status. Mirrors
 * `MarkSupplierOrderShipped`'s all-siblings-check pattern. Idempotent:
 * re-running after the order already advanced is a safe no-op, and an
 * order that's already shipped/delivered is never touched (`cancelled` is
 * only a legal target from `unfulfilled`/`processing`).
 */
export class CancelSupplierOrder
  implements UseCase<CancelSupplierOrderInput, CancelSupplierOrderResult>
{
  constructor(
    private readonly supplierOrders: SupplierOrderRepository,
    private readonly orders: OrderFulfillmentRepository,
  ) {}

  async execute(input: CancelSupplierOrderInput): Promise<CancelSupplierOrderResult> {
    const cancelled = await this.supplierOrders.cancel(input.supplierOrderId);
    if (!cancelled) return { cancelled: false };

    const allCancelled = await this.supplierOrders.allCancelledForOrder(input.orderId);
    if (!allCancelled) return { cancelled: true };

    const [paymentStatus, fulfillmentStatus] = await Promise.all([
      this.orders.getPaymentStatus(input.orderId),
      this.orders.getFulfillmentStatus(input.orderId),
    ]);
    if (paymentStatus === null || fulfillmentStatus === null) return { cancelled: true };
    if (fulfillmentStatus !== 'unfulfilled' && fulfillmentStatus !== 'processing') {
      // Already cancelled (no-op) or shipped/delivered (cancelled isn't a
      // legal target from there) — never attempt the transition.
      return { cancelled: true };
    }

    assertFulfillmentTransition(paymentStatus, fulfillmentStatus, 'cancelled');
    await this.orders.setFulfillmentStatus(input.orderId, 'cancelled');
    return { cancelled: true };
  }
}
