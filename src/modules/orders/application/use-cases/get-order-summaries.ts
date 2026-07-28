import type { UseCase } from '@/shared/application/use-case';
import type {
  OrderSummary,
  OrderSummaryRepository,
} from '@/modules/orders/application/ports/order-summary-repository';

export interface GetOrderSummariesInput {
  orderIds: string[];
}

/** Summaries for a page of orders, keyed by id. The fulfillment queue shows
 * one per order group; fetching them individually was a query per row. */
export class GetOrderSummaries implements UseCase<GetOrderSummariesInput, Map<string, OrderSummary>> {
  constructor(private readonly orders: OrderSummaryRepository) {}

  async execute(input: GetOrderSummariesInput): Promise<Map<string, OrderSummary>> {
    const summaries = await this.orders.getSummaries(input.orderIds);
    return new Map(summaries.map((s) => [s.id, s] as const));
  }
}
