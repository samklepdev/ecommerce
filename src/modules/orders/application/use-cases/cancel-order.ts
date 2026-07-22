import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { CancelOrderRepository } from '@/modules/orders/application/ports/cancel-order-repository';
import type { CancelPaymentIntentStore } from '@/modules/orders/application/ports/cancel-payment-intent-store';

export interface CancelOrderInput {
  orderId: string;
  /** null for the guest/id-only path — see CancelOrderRepository. */
  userId: string | null;
}

export type CancelOrderError = { code: 'not_cancellable' };

export class CancelOrder implements UseCase<CancelOrderInput, Result<void, CancelOrderError>> {
  constructor(
    private readonly orders: CancelOrderRepository,
    private readonly paymentIntents: CancelPaymentIntentStore,
  ) {}

  async execute(input: CancelOrderInput): Promise<Result<void, CancelOrderError>> {
    const cancelled = await this.orders.cancelOrder(input.orderId, input.userId);
    if (!cancelled) return err({ code: 'not_cancellable' });

    // Safe no-op if the order never reached awaiting_payment (no intent
    // row exists yet) — the underlying UPDATE just matches zero rows.
    await this.paymentIntents.markCancelled(input.orderId);
    return ok(undefined);
  }
}
