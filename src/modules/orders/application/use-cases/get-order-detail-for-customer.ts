import type { UseCase } from '@/shared/application/use-case';
import type {
  OrderDetail,
  OrderHistoryRepository,
} from '@/modules/orders/application/ports/order-history-repository';

export interface GetOrderDetailForCustomerInput {
  orderId: string;
  userId: string;
}

export class GetOrderDetailForCustomer
  implements UseCase<GetOrderDetailForCustomerInput, OrderDetail | null>
{
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: GetOrderDetailForCustomerInput): Promise<OrderDetail | null> {
    return this.orderHistory.findDetailById(input.orderId, input.userId);
  }
}
