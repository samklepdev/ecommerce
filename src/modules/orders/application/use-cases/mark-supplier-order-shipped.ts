import type { UseCase } from '@/shared/application/use-case';
import { assertFulfillmentTransition } from '@/modules/orders/domain/order-status';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

export interface MarkSupplierOrderShippedInput {
  supplierOrderId: string;
  orderId: string;
  trackingNumber: string;
}

/**
 * Marks one supplier order shipped, and — once every supplier order tied to
 * the parent customer order has shipped — advances the order's own
 * fulfillment status. Idempotent: re-running after the order already
 * advanced is a safe no-op.
 */
export class MarkSupplierOrderShipped implements UseCase<MarkSupplierOrderShippedInput, boolean> {
  constructor(
    private readonly supplierOrders: SupplierOrderRepository,
    private readonly orders: OrderFulfillmentRepository,
  ) {}

  async execute(input: MarkSupplierOrderShippedInput): Promise<boolean> {
    const shipped = await this.supplierOrders.markShipped(
      input.supplierOrderId,
      input.trackingNumber,
    );
    if (!shipped) return false;

    const allShipped = await this.supplierOrders.allShippedForOrder(input.orderId);
    if (!allShipped) return true;

    const [paymentStatus, fulfillmentStatus] = await Promise.all([
      this.orders.getPaymentStatus(input.orderId),
      this.orders.getFulfillmentStatus(input.orderId),
    ]);
    if (paymentStatus === null || fulfillmentStatus === null) return true;
    if (fulfillmentStatus === 'shipped') return true; // already advanced — no-op

    assertFulfillmentTransition(paymentStatus, fulfillmentStatus, 'shipped');
    await this.orders.setFulfillmentStatus(input.orderId, 'shipped');
    return true;
  }
}
