import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

export interface UpdateSupplierOrderReferenceInput {
  supplierOrderId: string;
  reference: string;
}

/** Edits an already-set supplier-order reference — distinct from
 * `MarkSupplierOrderOrdered`, which also transitions the status. */
export class UpdateSupplierOrderReference implements UseCase<UpdateSupplierOrderReferenceInput, void> {
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(input: UpdateSupplierOrderReferenceInput): Promise<void> {
    await this.supplierOrders.updateReference(input.supplierOrderId, input.reference);
  }
}
