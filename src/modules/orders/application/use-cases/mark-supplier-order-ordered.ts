import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOrderRepository } from '@/modules/orders/application/ports/supplier-order-repository';

export interface MarkSupplierOrderOrderedInput {
  supplierOrderId: string;
  reference: string;
}

export class MarkSupplierOrderOrdered implements UseCase<MarkSupplierOrderOrderedInput, boolean> {
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(input: MarkSupplierOrderOrderedInput): Promise<boolean> {
    return this.supplierOrders.markOrdered(input.supplierOrderId, input.reference);
  }
}
