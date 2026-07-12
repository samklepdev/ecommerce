import { env } from '@/config/env';
import { err, isErr, ok, type Result } from '@/shared/domain/result';
import type { UseCase } from '@/shared/application/use-case';
import type { CheckoutOrderRepository } from '@/modules/checkout/application/ports/checkout-order-repository';
import type { PaymentGatewayRegistry } from '@/modules/payments/application/payment-gateway-registry';
import type { PaymentMethod } from '@/modules/payments/application/payment-provider';
import type { CreatePaymentOutput } from '@/modules/payments/application/ports/payment-gateway';

export interface StartCheckoutInput {
  orderId: string;
  customerEmail: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
}

export type PaymentSession = CreatePaymentOutput;

export type StartCheckoutError = { code: 'gateway_error'; message: string };

/**
 * reprice (server-side) -> gateway.createPayment. No inventory reservation —
 * items are sourced from suppliers after payment confirms, not held in stock.
 * Idempotent: the gateway itself de-dupes a retry and returns the existing
 * intent.
 */
export class StartCheckout
  implements UseCase<StartCheckoutInput, Result<PaymentSession, StartCheckoutError>>
{
  constructor(
    private readonly orders: CheckoutOrderRepository,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  async execute(input: StartCheckoutInput): Promise<Result<PaymentSession, StartCheckoutError>> {
    const total = await this.orders.repriceAndGetTotal(input.orderId);

    const gateway = this.gateways.resolve(input.paymentMethod);
    const result = await gateway.createPayment({
      orderId: input.orderId,
      amount: total,
      idempotencyKey: input.idempotencyKey,
    });

    if (isErr(result)) return err(result.error);

    const paymentWindowExpiresAt = new Date(Date.now() + env.QUOTE_TTL_SECONDS * 1000);
    await this.orders.markAwaitingPayment(
      input.orderId,
      result.value.reference,
      paymentWindowExpiresAt,
    );

    return ok(result.value);
  }
}
