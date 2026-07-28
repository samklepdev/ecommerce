import type { UseCase } from '@/shared/application/use-case';
import type {
  AdminOrderCounts,
  OrderHistoryRepository,
} from '@/modules/orders/application/ports/order-history-repository';

export interface GetAdminOrderCountsInput {
  since: Date;
  until: Date;
}

/** The dashboard's attention-queue numbers. One query — the page used to
 * pull every order in the store and count them in JavaScript, three times. */
export class GetAdminOrderCounts implements UseCase<GetAdminOrderCountsInput, AdminOrderCounts> {
  constructor(private readonly orderHistory: OrderHistoryRepository) {}

  async execute(input: GetAdminOrderCountsInput): Promise<AdminOrderCounts> {
    return this.orderHistory.getAdminOrderCounts(input);
  }
}
