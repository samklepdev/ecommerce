import type { UseCase } from '@/shared/application/use-case';

export interface OrderEventRecord {
  id: string;
  eventType: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ListOrderEventsRepository {
  /** Chronological (oldest first) — the point is to read it as a timeline. */
  listForOrder(orderId: string): Promise<OrderEventRecord[]>;
}

export interface ListOrderEventsInput {
  orderId: string;
}

export class ListOrderEvents implements UseCase<ListOrderEventsInput, OrderEventRecord[]> {
  constructor(private readonly orderEvents: ListOrderEventsRepository) {}

  async execute(input: ListOrderEventsInput): Promise<OrderEventRecord[]> {
    return this.orderEvents.listForOrder(input.orderId);
  }
}
