import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

export interface UpdateSupplierOrderTrackingNumberInput {
  supplierOrderId: string;
  trackingNumber: string;
  carrier?: string | null;
}

/** Edits an already-set tracking number — distinct from
 * `MarkSupplierOrderShipped`, which also transitions the status. */
export class UpdateSupplierOrderTrackingNumber
  implements UseCase<UpdateSupplierOrderTrackingNumberInput, void>
{
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(input: UpdateSupplierOrderTrackingNumberInput): Promise<void> {
    await this.supplierOrders.updateTrackingNumber(input.supplierOrderId, input.trackingNumber, input.carrier);
  }
}
