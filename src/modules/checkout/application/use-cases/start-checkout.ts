import { err, isErr, ok, type Result } from '@/shared/domain/result';
import type { UseCase } from '@/shared/application/use-case';
import type { AssertStoreOpenForCheckout } from '@/shared/application/use-cases/assert-store-open-for-checkout';
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

export type StartCheckoutError =
  | { code: 'gateway_error'; message: string }
  | { code: 'store_closed' }
  /** The repriced total is zero or less — nothing a customer could pay. */
  | { code: 'total_not_payable'; totalMinor: number };

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
    private readonly quoteTtlSeconds: number,
    private readonly orderWindowHours: number,
    private readonly storeIsOpen: AssertStoreOpenForCheckout,
  ) {}

  async execute(input: StartCheckoutInput): Promise<Result<PaymentSession, StartCheckoutError>> {
    // Before allocating anything. A BTC address index is a one-way counter,
    // so a checkout that starts and then gets refused has already burned an
    // address — and burned addresses eat into the wallet's scan gap limit.
    if (!(await this.storeIsOpen.execute())) return err({ code: 'store_closed' });

    const total = await this.orders.repriceAndGetTotal(input.orderId);

    /**
     * Nothing payable, so nothing to allocate. Checked **before** the gateway,
     * because `createPayment` burns an address index — a one-way counter that
     * eats into the watching wallet's BIP32 gap limit — and an invoice for zero
     * satoshis could never be settled anyway: the watcher treats
     * `confirmedSats > 0` as "seen", so it would never look at it again.
     *
     * Reachable without an admin doing anything: a fixed-amount coupon at or
     * above the subtotal is clamped to the subtotal, and shipping is zero when
     * no rate row exists. `EditOrderLines` guards its own path; this is the
     * other one.
     */
    if (total.amountMinor <= 0) {
      return err({ code: 'total_not_payable', totalMinor: total.amountMinor });
    }

    const gateway = this.gateways.resolve(input.paymentMethod);
    const result = await gateway.createPayment({
      orderId: input.orderId,
      amount: total,
      idempotencyKey: input.idempotencyKey,
    });

    if (isErr(result)) return err(result.error);

    const paymentWindowExpiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000);
    // Two clocks. The quote's is short because it's a held price; the
    // order's is long because it's a customer's attention span. The
    // repository keeps the first deadline it was given, so re-quoting an
    // order never extends how long it stays open.
    const paymentDeadlineAt = new Date(Date.now() + this.orderWindowHours * 3_600_000);
    await this.orders.markAwaitingPayment(input.orderId, result.value.reference, paymentWindowExpiresAt, paymentDeadlineAt);

    return ok(result.value);
  }
}
