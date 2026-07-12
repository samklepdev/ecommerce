import type { UseCase } from '@/shared/application/use-case';
import { assertPaymentTransition } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';

export interface MarkAwaitingConfirmationInput {
  orderId: string;
}

/**
 * Records that a payment has been seen on-chain but doesn't yet have enough
 * confirmations — CLAUDE.md's "seen-but-shallow" state. Best-effort status
 * tracking, not a gate: idempotent re-entry (already awaiting_confirmation,
 * or already past it) is a safe no-op.
 */
export class MarkAwaitingConfirmation implements UseCase<MarkAwaitingConfirmationInput, void> {
  constructor(private readonly orders: ConfirmPaymentOrderRepository) {}

  async execute(input: MarkAwaitingConfirmationInput): Promise<void> {
    const status = await this.orders.getPaymentStatus(input.orderId);
    if (status === null || status === 'awaiting_confirmation') return;
    if (status !== 'awaiting_payment') return; // already progressed past this point
    assertPaymentTransition(status, 'awaiting_confirmation');
    await this.orders.setPaymentStatus(input.orderId, 'awaiting_confirmation');
  }
}
