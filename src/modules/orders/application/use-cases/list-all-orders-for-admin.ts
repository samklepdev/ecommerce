import type { UseCase } from '@/shared/application/use-case';
import type {
  OrderHistoryRepository,
  OrderListItem,
} from '@/modules/orders/application/ports/order-history-repository';

export interface ListAllOrdersForAdminInput {
  email?: string;
}

export class ListAllOrdersForAdmin implements UseCase<ListAllOrdersForAdminInput, OrderListItem[]> {
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: ListAllOrdersForAdminInput): Promise<OrderListItem[]> {
    return this.orderHistory.listAllForAdmin({ email: input.email });
  }
}
