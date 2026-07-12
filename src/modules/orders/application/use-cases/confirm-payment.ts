import type { UseCase } from '@/shared/application/use-case';
import { assertPaymentTransition } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';

export interface ProcessedEventStore {
  seen(eventId: string): Promise<boolean>;
  markSeen(eventId: string): Promise<void>;
}

export interface FulfillmentQueue {
  enqueueOrderPaid(orderId: string): Promise<void>;
}

export interface ConfirmPaymentInput {
  orderId: string;
  eventId: string;
  confirmedSats: number;
}

/**
 * The ONLY place an order moves to `paid`, driven by the chain-watcher.
 * De-dupes by event id (watcher passes are re-run) and by the order's current
 * status — re-entrant paid->paid is a guarded no-op, never a re-application.
 */
export class ConfirmPayment implements UseCase<ConfirmPaymentInput, void> {
  constructor(
    private readonly orders: ConfirmPaymentOrderRepository,
    private readonly processedEvents: ProcessedEventStore,
    private readonly fulfillment: FulfillmentQueue,
  ) {}

  async execute(input: ConfirmPaymentInput): Promise<void> {
    if (await this.processedEvents.seen(input.eventId)) return;

    const status = await this.orders.getPaymentStatus(input.orderId);
    if (status === null) return;
    if (status === 'paid') {
      await this.processedEvents.markSeen(input.eventId);
      return;
    }

    assertPaymentTransition(status, 'paid');
    await this.orders.setPaymentStatus(input.orderId, 'paid');

    await this.fulfillment.enqueueOrderPaid(input.orderId);
    await this.processedEvents.markSeen(input.eventId);
  }
}
