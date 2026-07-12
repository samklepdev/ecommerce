import type { UseCase } from '@/shared/application/use-case';
import type {
  SupplierOrderRepository,
  SupplierOrderSummary,
} from '@/modules/orders/application/ports/supplier-order-repository';

export class ListSupplierOrdersNeedingAction implements UseCase<void, SupplierOrderSummary[]> {
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(): Promise<SupplierOrderSummary[]> {
    return this.supplierOrders.listNeedingAction();
  }
}
