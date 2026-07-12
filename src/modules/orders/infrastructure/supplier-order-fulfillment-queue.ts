import type { FulfillmentQueue } from '@/modules/orders/application/use-cases/confirm-payment';
import type { CreateSupplierOrdersForPaidOrder } from '@/modules/orders/application/use-cases/create-supplier-orders-for-paid-order';

/**
 * Runs in-process (no BullMQ yet — see docs). Turns "order paid" into the ops
 * fulfillment task queue: one SupplierOrder per distinct preferred supplier
 * for that order's lines.
 */
export class SupplierOrderFulfillmentQueue implements FulfillmentQueue {
  constructor(private readonly createSupplierOrders: CreateSupplierOrdersForPaidOrder) {}

  async enqueueOrderPaid(orderId: string): Promise<void> {
    await this.createSupplierOrders.execute({ orderId });
  }
}
