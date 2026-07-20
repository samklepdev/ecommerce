import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import { assertPaymentTransition } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { PaymentConfirmationNotifier } from '@/modules/orders/application/ports/payment-confirmation-notifier';

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
    private readonly paymentConfirmationNotifier: PaymentConfirmationNotifier,
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

    try {
      await this.paymentConfirmationNotifier.notifyPaymentConfirmed(input.orderId);
    } catch (e) {
      // Never let a transient email failure block marking the event
      // processed — the `status === 'paid'` guard above already makes
      // re-entry safe, so a retry wouldn't resend the email anyway.
      logger.warn('confirm-payment: payment confirmation notification failed', {
        orderId: input.orderId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    await this.processedEvents.markSeen(input.eventId);
  }
}
