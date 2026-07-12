import type { UseCase } from '@/shared/application/use-case';
import type {
  OrderSummary,
  OrderSummaryRepository,
} from '@/modules/orders/application/ports/order-summary-repository';

export interface GetOrderSummaryInput {
  orderId: string;
}

export class GetOrderSummary implements UseCase<GetOrderSummaryInput, OrderSummary | null> {
  constructor(private readonly orders: OrderSummaryRepository) {}

  async execute(input: GetOrderSummaryInput): Promise<OrderSummary | null> {
    return this.orders.getSummary(input.orderId);
  }
}
