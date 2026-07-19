import type { UseCase } from '@/shared/application/use-case';
import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';
import type {
  SupplierOrderRepository,
  SupplierOrderSummary,
} from '@/modules/orders/application/ports/supplier-order-repository';

export interface ListSupplierOrdersByStatusInput {
  status?: SupplierOrderStatus;
}

export class ListSupplierOrdersByStatus
  implements UseCase<ListSupplierOrdersByStatusInput, SupplierOrderSummary[]>
{
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(input: ListSupplierOrdersByStatusInput): Promise<SupplierOrderSummary[]> {
    return this.supplierOrders.listByStatus(input.status);
  }
}
