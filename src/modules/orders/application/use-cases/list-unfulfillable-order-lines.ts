import type { UseCase } from '@/shared/application/use-case';
import type {
  UnfulfillableOrderLine,
  UnfulfillableOrderLinesRepository,
} from '@/modules/orders/application/ports/unfulfillable-order-lines-repository';

/** Admin-visible list of paid order lines `CreateSupplierOrdersForPaidOrder`
 * couldn't source (no preferred supplier offer) — a durable record, not
 * just a log line, so an admin can see and act on it. */
export class ListUnfulfillableOrderLines implements UseCase<void, UnfulfillableOrderLine[]> {
  constructor(private readonly orders: UnfulfillableOrderLinesRepository) {}

  async execute(): Promise<UnfulfillableOrderLine[]> {
    return this.orders.listUnfulfillableLines();
  }
}
