import type { UseCase } from '@/shared/application/use-case';
import { assertPaymentTransition, type PaymentStatus } from '@/modules/orders/domain/order-status';

export interface MarkAwaitingConfirmationOrderRepository {
  getPaymentStatus(orderId: string): Promise<PaymentStatus | null>;
  /** Transitions to awaiting_confirmation and stamps `awaitingConfirmationSince`
   * — guarded so both only ever happen on the first (awaiting_payment ->
   * awaiting_confirmation) entry; a repeat call while already in this status
   * is a no-op, so the timestamp always reflects first entry. */
  markAwaitingConfirmation(orderId: string): Promise<void>;
}

export interface MarkAwaitingConfirmationInput {
  orderId: string;
}

/**
 * Records that a payment has been seen on-chain but doesn't yet have enough
 * confirmations — CLAUDE.md's "seen-but-shallow" state. Best-effort status
 * tracking, not a gate: idempotent re-entry (already awaiting_confirmation,
 * or already past it) is a safe no-op — including not re-stamping
 * `awaitingConfirmationSince`, which FailStuckAwaitingConfirmationOrders
 * relies on reflecting first entry, not the most recent watcher pass.
 */
export class MarkAwaitingConfirmation implements UseCase<MarkAwaitingConfirmationInput, void> {
  constructor(private readonly orders: MarkAwaitingConfirmationOrderRepository) {}

  async execute(input: MarkAwaitingConfirmationInput): Promise<void> {
    const status = await this.orders.getPaymentStatus(input.orderId);
    if (status === null || status === 'awaiting_confirmation') return;
    if (status !== 'awaiting_payment') return; // already progressed past this point
    assertPaymentTransition(status, 'awaiting_confirmation');
    await this.orders.markAwaitingConfirmation(input.orderId);
  }
}
