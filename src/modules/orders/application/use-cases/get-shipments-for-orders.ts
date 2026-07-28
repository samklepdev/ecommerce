import type { UseCase } from '@/shared/application/use-case';
import type {
  SupplierOrderRepository,
  SupplierOrderSummary,
} from '@/modules/orders/application/ports/supplier-order-repository';

export interface GetShipmentsForOrdersInput {
  orderIds: string[];
}

/** Every supplier order for a set of customer orders, keyed by customer
 * order id — one query for a page of the fulfillment queue rather than one
 * per group. */
export class GetShipmentsForOrders
  implements UseCase<GetShipmentsForOrdersInput, Map<string, SupplierOrderSummary[]>>
{
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(input: GetShipmentsForOrdersInput): Promise<Map<string, SupplierOrderSummary[]>> {
    const byOrder = new Map<string, SupplierOrderSummary[]>();
    if (input.orderIds.length === 0) return byOrder;

    for (const supplierOrder of await this.supplierOrders.listByOrderIds(input.orderIds)) {
      const existing = byOrder.get(supplierOrder.orderId);
      if (existing) existing.push(supplierOrder);
      else byOrder.set(supplierOrder.orderId, [supplierOrder]);
    }
    return byOrder;
  }
}
