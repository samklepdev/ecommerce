import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

export interface CancelSupplierOrderInput {
  supplierOrderId: string;
}

export interface CancelSupplierOrderResult {
  cancelled: boolean;
}

/** No order-level fulfillment side effect — cancelling one supplier order
 * doesn't advance the parent order's own fulfillment status the way "all
 * shipped" does. */
export class CancelSupplierOrder
  implements UseCase<CancelSupplierOrderInput, CancelSupplierOrderResult>
{
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(input: CancelSupplierOrderInput): Promise<CancelSupplierOrderResult> {
    const cancelled = await this.supplierOrders.cancel(input.supplierOrderId);
    return { cancelled };
  }
}
