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

export interface PaymentGateway {
  readonly method: PaymentMethod;
  createPayment(
    input: CreatePaymentInput,
  ): Promise<Result<CreatePaymentOutput, CreatePaymentError>>;
}
