import type { UseCase } from '@/shared/application/use-case';
import type { BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';
import { toBip21 } from '@/modules/payments/domain/bip21';

export interface GetPaymentSessionForOrderInput {
  orderId: string;
}

export interface PaymentSession {
  address: string;
  bip21Uri: string;
  expiresAt: Date;
}

/** Reads the already-persisted payment intent rather than re-invoking
 * `StartCheckout` — that use case unconditionally recomputes
 * `paymentWindowExpiresAt` even on its idempotent path, which would desync
 * `orders.paymentWindowExpiresAt` from the actually-persisted
 * `bitcoinPaymentIntents.expiresAt`. This is a pure read. */
export class GetPaymentSessionForOrder implements UseCase<GetPaymentSessionForOrderInput, PaymentSession | null> {
  constructor(private readonly paymentStore: BitcoinPaymentStore) {}

  async execute(input: GetPaymentSessionForOrderInput): Promise<PaymentSession | null> {
    const intent = await this.paymentStore.getByOrderId(input.orderId);
    if (!intent) return null;

    return {
      address: intent.address,
      bip21Uri: toBip21(intent.address, intent.expectedSats),
      expiresAt: intent.expiresAt,
    };
  }
}
