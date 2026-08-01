import type { UseCase } from '@/shared/application/use-case';
import { fetchPage, type PageRequest, type PageResult } from '@/shared/application/page';
import type {
  AdminOrderFilter,
  OrderHistoryRepository,
  OrderListItem,
} from '@/modules/orders/application/ports/order-history-repository';

export interface ListAllOrdersForAdminInput extends PageRequest, AdminOrderFilter {}

/** One page of orders, counted and sliced in SQL. This used to return every
 * order in the store for the page to slice in JavaScript. */
export class ListAllOrdersForAdmin
  implements UseCase<ListAllOrdersForAdminInput, PageResult<OrderListItem>>
{
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: ListAllOrdersForAdminInput): Promise<PageResult<OrderListItem>> {
    // Built explicitly rather than passing `input` through: that would hand
    // the page number to the filter, and the count and the list have to be
    // filtered by exactly the same thing or the pagination lies.
    const filter: AdminOrderFilter = {
      email: input.email,
      paymentStatus: input.paymentStatus,
      fulfillmentStatus: input.fulfillmentStatus,
      recovered: input.recovered,
      latePayment: input.latePayment,
    };
    return fetchPage(
      input,
      () => this.orderHistory.countAllForAdmin(filter),
      (limit, offset) => this.orderHistory.listAllForAdmin(filter, limit, offset),
    );
  }
}
