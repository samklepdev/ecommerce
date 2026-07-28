import type { Money } from '@/shared/domain/money';
import type { Result } from '@/shared/domain/result';
import type { PaymentMethod } from '@/modules/payments/application/payment-provider';

export interface CreatePaymentInput {
  orderId: string;
  amount: Money;
  idempotencyKey: string;
}

export interface CreatePaymentOutput {
  /** Provider-specific reference — a BTC address for the on-chain gateway. */
  reference: string;
  bip21Uri: string;
  expiresAt: Date | null;
  /** Locked BTC amount in satoshis — needed to render a readable amount
   * alongside the QR, not just encoded inside the BIP21 URI. */
  expectedSats: number;
}

export type CreatePaymentError = { code: 'gateway_error'; message: string };

export interface RepricePaymentInput {
  orderId: string;
  amount: Money;
}

export interface RepricePaymentOutput {
  /** Null when the order has no payment yet — nothing needed repricing. */
  expiresAt: Date | null;
  expectedSats: number | null;
}

export type RepricePaymentError =
  /** The payment is past the point where the amount owed can move: money has
   * been seen, or it already settled, expired or failed. */
  | { code: 'payment_not_repriceable' }
  | { code: 'gateway_error'; message: string };

export interface PaymentGateway {
  readonly method: PaymentMethod;
  createPayment(
    input: CreatePaymentInput,
  ): Promise<Result<CreatePaymentOutput, CreatePaymentError>>;
  /**
   * Restates what an existing, unpaid payment is for, after the order it
   * belongs to changed. Same payment, new amount — for the on-chain gateway
   * that means the same receive address with a fresh quote, deliberately:
   * issuing a new address would orphan anything the customer had already
   * sent to the old one, and burn an address index for nothing.
   */
  repricePayment(
    input: RepricePaymentInput,
  ): Promise<Result<RepricePaymentOutput, RepricePaymentError>>;
}
