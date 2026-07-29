import type { UseCase } from '@/shared/application/use-case';
import { assertFulfillmentTransition } from '@/modules/orders/domain/order-status';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';
import type { ShipmentNotifier } from '@/modules/orders/application/ports/shipment-notifier';

export interface MarkSupplierOrderShippedInput {
  supplierOrderId: string;
  orderId: string;
  trackingNumber: string;
  carrier?: string | null;
}

/**
 * Marks one supplier order shipped, emails the customer its tracking
 * number, and — once every supplier order tied to the parent customer order
 * has shipped — advances the order's own fulfillment status. Idempotent:
 * re-running after the order already advanced is a safe no-op.
 */
export class MarkSupplierOrderShipped implements UseCase<MarkSupplierOrderShippedInput, boolean> {
  constructor(
    private readonly supplierOrders: SupplierOrderRepository,
    private readonly orders: OrderFulfillmentRepository,
    private readonly notifier: ShipmentNotifier,
  ) {}

  async execute(input: MarkSupplierOrderShippedInput): Promise<boolean> {
    const shipped = await this.supplierOrders.markShipped(
      input.supplierOrderId,
      input.trackingNumber,
      input.carrier,
    );
    if (!shipped) return false;

    // Sent per parcel, not per order: holding the first tracking number
    // back until the last supplier ships is how a customer ends up emailing
    // to ask where their order is. The notifier never throws — the parcel is
    // already moving, and a mail failure must not undo the record of it.
    await this.notifier.notifyShipped(input.orderId);

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
