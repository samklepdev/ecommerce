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
  getOrderLines(orderId: string): Promise<PaidOrderLine[]>;
  /** Durable, admin-visible record that a line couldn't be sourced — not
   * just a log line, so an admin can act on it after adding a supplier
   * offer. */
  flagFulfillmentIssue(orderLineId: string, reason: string): Promise<void>;
}

export interface CreateSupplierOrdersForPaidOrderInput {
  orderId: string;
}

/**
 * Groups a paid order's lines by each product's preferred supplier and
 * creates one SupplierOrder per distinct supplier — the ops task queue this
 * becomes `/admin/fulfillment`. Lines whose product has no preferred offer
 * are skipped; there's nothing actionable to buy without a source.
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
    const lines = await this.orders.getOrderLines(input.orderId);
    if (lines.length === 0) return; // dev harness orders have no lines

    const bySupplier = new Map<string, CreateSupplierOrderInput>();

    for (const line of lines) {
      const offer = await this.supplierOffers.findPreferredByProductId(line.productId);
      if (!offer) {
        logger.warn('supplier order line skipped: no preferred offer', {
          orderId: input.orderId,
          orderLineId: line.id,
          productId: line.productId,
        });
        await this.orders.flagFulfillmentIssue(line.id, 'no_preferred_supplier_offer');
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
    }

    if (bySupplier.size === 0) return;
    await this.supplierOrders.createForPaidOrder([...bySupplier.values()]);

    const [fulfillmentStatus, paymentStatus] = await Promise.all([
      this.orderFulfillment.getFulfillmentStatus(input.orderId),
      this.orderFulfillment.getPaymentStatus(input.orderId),
    ]);
    if (fulfillmentStatus === 'unfulfilled' && paymentStatus !== null) {
      assertFulfillmentTransition(paymentStatus, fulfillmentStatus, 'processing');
      await this.orderFulfillment.setFulfillmentStatus(input.orderId, 'processing');
    }
  }
}
