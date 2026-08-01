import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
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

    /**
     * The supplier order is already `shipped` and the customer already has the
     * tracking number, so this last step must not be able to throw.
     *
     * It could: `CancelOrderFulfillment` is offered at any payment status and
     * `FULFILLMENT_TRANSITIONS.cancelled` is empty, so an order cancelled
     * while its parcel was in flight made `cancelled -> shipped` illegal. The
     * throw landed after both side effects, and the action doesn't catch it —
     * the admin saw a 500, the customer had been told their cancelled order
     * shipped, and the audit entry was never written.
     *
     * Caught rather than pre-checked, matching `MarkOrderDelivered`: the
     * status can move between the read above and this write, so the
     * transition table stays the authority and this decides what to do when it
     * refuses. The parcel is real either way, so the supplier order keeps its
     * `shipped` state and only the order-level advance is skipped.
     */
    try {
      assertFulfillmentTransition(paymentStatus, fulfillmentStatus, 'shipped');
    } catch {
      logger.warn('supplier order shipped, but the order could not advance to shipped', {
        orderId: input.orderId,
        supplierOrderId: input.supplierOrderId,
        paymentStatus,
        fulfillmentStatus,
      });
      return true;
    }

    await this.orders.setFulfillmentStatus(input.orderId, 'shipped');
    return true;
  }
}
