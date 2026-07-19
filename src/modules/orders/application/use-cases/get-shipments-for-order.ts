import type { UseCase } from '@/shared/application/use-case';
import type {
  SupplierOrderRepository,
  SupplierOrderSummary,
} from '@/modules/orders/application/ports/supplier-order-repository';

export interface GetShipmentsForOrderInput {
  orderId: string;
}

export class GetShipmentsForOrder implements UseCase<GetShipmentsForOrderInput, SupplierOrderSummary[]> {
  constructor(private readonly supplierOrders: SupplierOrderRepository) {}

  async execute(input: GetShipmentsForOrderInput): Promise<SupplierOrderSummary[]> {
    return this.supplierOrders.listByOrderId(input.orderId);
  }
}
