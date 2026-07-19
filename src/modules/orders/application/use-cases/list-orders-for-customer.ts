import type { UseCase } from '@/shared/application/use-case';
import type {
  OrderHistoryRepository,
  OrderListItem,
} from '@/modules/orders/application/ports/order-history-repository';

export interface ListOrdersForCustomerInput {
  userId: string;
}

export class ListOrdersForCustomer implements UseCase<ListOrdersForCustomerInput, OrderListItem[]> {
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: ListOrdersForCustomerInput): Promise<OrderListItem[]> {
    return this.orderHistory.listByCustomer(input.userId);
  }
}
