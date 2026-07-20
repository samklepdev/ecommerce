import type { UseCase } from '@/shared/application/use-case';
import type {
  OrderDetail,
  OrderHistoryRepository,
} from '@/modules/orders/application/ports/order-history-repository';

export interface GetOrderDetailInput {
  orderId: string;
}

/** Unscoped — see `OrderHistoryRepository.findById`. Used for the public
 * guest order-status page and anything else with only an order id. */
export class GetOrderDetail implements UseCase<GetOrderDetailInput, OrderDetail | null> {
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: GetOrderDetailInput): Promise<OrderDetail | null> {
    return this.orderHistory.findById(input.orderId);
  }
}
