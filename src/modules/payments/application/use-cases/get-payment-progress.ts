import type { UseCase } from '@/shared/application/use-case';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';

export interface GetPaymentProgressInput {
  orderId: string;
}

export interface PaymentProgress {
  status: PaymentStatus;
  confirmations: number;
  requiredConfirmations: number;
  underpaid: boolean;
  overpaid: boolean;
}

/** Composes across the orders/payments module boundary at the application
 * layer — the same pattern `WatchBitcoinPayments` already uses — so the
 * status route never touches either repository directly (CLAUDE.md rule 3). */
export class GetPaymentProgress implements UseCase<GetPaymentProgressInput, PaymentProgress | null> {
  constructor(
    private readonly orders: ConfirmPaymentOrderRepository,
    private readonly paymentStore: BitcoinPaymentStore,
    private readonly requiredConfirmations: number,
  ) {}

  async execute(input: GetPaymentProgressInput): Promise<PaymentProgress | null> {
    const status = await this.orders.getPaymentStatus(input.orderId);
    if (status === null) return null;

    const intent = await this.paymentStore.getByOrderId(input.orderId);

    return {
      status,
      confirmations: intent?.confirmations ?? 0,
      requiredConfirmations: this.requiredConfirmations,
      underpaid: intent?.underpaid ?? false,
      overpaid: intent?.overpaid ?? false,
    };
  }
}
