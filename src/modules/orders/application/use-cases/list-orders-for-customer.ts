import type { UseCase } from '@/shared/application/use-case';
import { fetchPage, type PageRequest, type PageResult } from '@/shared/application/page';
import type {
  OrderHistoryRepository,
  OrderListItem,
} from '@/modules/orders/application/ports/order-history-repository';

export interface ListOrdersForCustomerInput extends PageRequest {
  userId: string;
}

/** One page of the customer's own orders, counted and sliced in SQL. */
export class ListOrdersForCustomer
  implements UseCase<ListOrdersForCustomerInput, PageResult<OrderListItem>>
{
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: ListOrdersForCustomerInput): Promise<PageResult<OrderListItem>> {
    return fetchPage(
      input,
      () => this.orderHistory.countByCustomer(input.userId),
      (limit, offset) => this.orderHistory.listByCustomer(input.userId, limit, offset),
    );
  }
}
