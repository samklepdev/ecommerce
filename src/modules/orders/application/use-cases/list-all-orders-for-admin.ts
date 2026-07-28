import type { UseCase } from '@/shared/application/use-case';
import { fetchPage, type PageRequest, type PageResult } from '@/shared/application/page';
import type {
  OrderHistoryRepository,
  OrderListItem,
} from '@/modules/orders/application/ports/order-history-repository';

export interface ListAllOrdersForAdminInput extends PageRequest {
  email?: string;
}

/** One page of orders, counted and sliced in SQL. This used to return every
 * order in the store for the page to slice in JavaScript. */
export class ListAllOrdersForAdmin
  implements UseCase<ListAllOrdersForAdminInput, PageResult<OrderListItem>>
{
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: ListAllOrdersForAdminInput): Promise<PageResult<OrderListItem>> {
    const filter = { email: input.email };
    return fetchPage(
      input,
      () => this.orderHistory.countAllForAdmin(filter),
      (limit, offset) => this.orderHistory.listAllForAdmin(filter, limit, offset),
    );
  }
}
