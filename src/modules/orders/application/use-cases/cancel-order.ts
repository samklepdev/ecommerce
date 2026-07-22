import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { CancelOrderRepository } from '@/modules/orders/application/ports/cancel-order-repository';

export interface CancelOrderInput {
  orderId: string;
  /** null for the guest/id-only path — see CancelOrderRepository. */
  userId: string | null;
}

export type CancelOrderError = { code: 'not_cancellable' };

export class CancelOrder implements UseCase<CancelOrderInput, Result<void, CancelOrderError>> {
  constructor(private readonly orders: CancelOrderRepository) {}

  async execute(input: CancelOrderInput): Promise<Result<void, CancelOrderError>> {
    const cancelled = await this.orders.cancelOrder(input.orderId, input.userId);
    if (!cancelled) return err({ code: 'not_cancellable' });
    return ok(undefined);
  }
}
