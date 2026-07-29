import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import { assertFulfillmentTransition } from '@/modules/orders/domain/order-status';
import type { OrderFulfillmentRepository } from '@/modules/orders/application/ports/order-fulfillment-repository';
import type {
  CreateSupplierOrderInput,
  SupplierOrderRepository,
} from '@/modules/orders/application/ports/supplier-order-repository';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

export interface PaidOrderLine {
  id: string;
  productId: string;
  quantity: number;
}

export interface PaidOrderLinesRepository {
  /** Only the lines no supplier order covers yet. This is what makes a
   * re-run safe: a line that was already bought from a supplier is never
   * handed back, so re-sourcing an order can add what's missing without
   * ordering anything twice. */
  getUnsourcedOrderLines(orderId: string): Promise<PaidOrderLine[]>;
  /** Durable, admin-visible record that a line couldn't be sourced — not
   * just a log line, so an admin can act on it after adding a supplier
   * offer. */
  flagFulfillmentIssue(orderLineId: string, reason: string): Promise<void>;
  /** Cleared once the line is actually sourced, so it drops out of the
   * admin queue. Without this the flag outlives the problem. */
  clearFulfillmentIssue(orderLineId: string): Promise<void>;
}

export interface CreateSupplierOrdersForPaidOrderInput {
  orderId: string;
}

/**
 * Groups a paid order's lines by each product's supplier and creates one
 * SupplierOrder per distinct supplier — the ops task queue this becomes
 * `/admin/fulfillment`. Lines whose product has no supplier offer at all are
 * flagged for admin attention rather than silently dropped.
 *
 * Sourcing resolves through `findSourceableByProductId`, so a product whose
 * offers exist but none is flagged preferred still gets ordered instead of
 * stranding a paid line on a bookkeeping detail.
 *
 * **Re-runnable by design.** ConfirmPayment fires this once, but a line can
 * fail to source (no offer) on that pass, and the customer's money
 * has already settled irreversibly — so an admin must be able to add the
 * missing offer and run it again. Safety comes from
 * `getUnsourcedOrderLines`, which never returns a line a supplier order
 * already covers, so a second pass can only ever add what's missing.
 */
export class CreateSupplierOrdersForPaidOrder
  implements UseCase<CreateSupplierOrdersForPaidOrderInput, void>
{
  constructor(
    private readonly orders: PaidOrderLinesRepository,
    private readonly supplierOffers: SupplierOfferRepository,
    private readonly supplierOrders: SupplierOrderRepository,
    private readonly orderFulfillment: OrderFulfillmentRepository,
  ) {}

  async execute(input: CreateSupplierOrdersForPaidOrderInput): Promise<void> {
    // Checked up front now that this is reachable from an admin retry and
    // not just from ConfirmPayment: never spend money with a supplier for an
    // order that isn't paid (refunded, failed, or expired since).
    const paymentStatus = await this.orderFulfillment.getPaymentStatus(input.orderId);
    if (paymentStatus !== 'paid') {
      logger.warn('supplier orders skipped: order is not paid', {
        orderId: input.orderId,
        paymentStatus,
      });
      return;
    }

    const lines = await this.orders.getUnsourcedOrderLines(input.orderId);
    if (lines.length === 0) return; // dev harness orders have no lines

    const bySupplier = new Map<string, CreateSupplierOrderInput>();
    const sourcedLineIds: string[] = [];

    for (const line of lines) {
      const offer = await this.supplierOffers.findSourceableByProductId(line.productId);
      if (!offer) {
        logger.warn('supplier order line skipped: no supplier offer', {
          orderId: input.orderId,
          orderLineId: line.id,
          productId: line.productId,
        });
        await this.orders.flagFulfillmentIssue(line.id, 'no_supplier_offer');
        continue;
      }

      const draft = {
        orderLineId: line.id,
        productId: line.productId,
        quantity: line.quantity,
        unitCostMinor: offer.cost.amountMinor,
        costCurrency: offer.cost.currency,
      };

      const existing = bySupplier.get(offer.supplierId);
      if (existing) {
        existing.lines.push(draft);
      } else {
        bySupplier.set(offer.supplierId, {
          orderId: input.orderId,
          supplierId: offer.supplierId,
          lines: [draft],
        });
      }
      sourcedLineIds.push(line.id);
    }

    if (bySupplier.size === 0) return;
    await this.supplierOrders.createForPaidOrder([...bySupplier.values()]);

    // Only after the supplier orders exist: if the write above fails, the
    // line must stay flagged. A line flagged on an earlier pass and sourced
    // on this one is no longer a problem an admin needs to see.
    for (const orderLineId of sourcedLineIds) {
      await this.orders.clearFulfillmentIssue(orderLineId);
    }

    const fulfillmentStatus = await this.orderFulfillment.getFulfillmentStatus(input.orderId);
    if (fulfillmentStatus === 'unfulfilled') {
      assertFulfillmentTransition(paymentStatus, fulfillmentStatus, 'processing');
      await this.orderFulfillment.setFulfillmentStatus(input.orderId, 'processing');
    }
  }
}
