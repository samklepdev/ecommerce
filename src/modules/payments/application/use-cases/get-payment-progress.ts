import type { UseCase } from '@/shared/application/use-case';
import type { PaymentStatus } from '@/modules/orders/domain/order-status';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';
import { toBip21 } from '@/modules/payments/domain/bip21';

export interface GetPaymentProgressInput {
  orderId: string;
}

export interface PaymentProgress {
  status: PaymentStatus;
  confirmations: number;
  requiredConfirmations: number;
  underpaid: boolean;
  overpaid: boolean;
  /** What was quoted, in sats. 0 before checkout has created an intent. */
  expectedSats: number;
  /** What has actually arrived so far. */
  confirmedSats: number;
  /**
   * What is still owed, in sats — the figure a part-paid customer needs.
   *
   * Never negative, and 0 whenever a top-up isn't the right answer: fully paid,
   * overpaid, or an order that has closed.
   */
  shortfallSats: number;
  /**
   * BIP21 URI for the shortfall, against the **same address** as the original
   * quote. Null when there's nothing to top up.
   */
  topUpUri: string | null;
}

/**
 * Payment state for the customer-facing widget.
 *
 * Composes across the orders/payments module boundary at the application
 * layer — the same pattern `WatchBitcoinPayments` already uses — so the
 * status route never touches either repository directly (CLAUDE.md rule 3).
 *
 * The shortfall is quoted **in sats, from the original quote**, not re-priced at
 * today's rate. Once money is in flight the amount owed is settled: re-quoting
 * would move the goalposts under a payment already made, which is the same
 * reason `RefreshPaymentQuote` refuses to run past `awaiting_payment`.
 */
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

    const expectedSats = intent?.expectedSats ?? 0;
    const confirmedSats = intent?.confirmedSats ?? 0;

    // Only while the order is still collecting. A closed order (failed,
    // expired, cancelled) must not invite a top-up: that would take money for
    // something already dead. A `paid` one has nothing outstanding by
    // definition, even if it was short by less than the dust tolerance.
    const stillCollecting =
      status === 'pending' || status === 'awaiting_payment' || status === 'awaiting_confirmation';
    // `max(0, …)` rather than a signed difference: an overpaid order owes
    // nothing, and a negative "shortfall" would render as a nonsense amount.
    const shortfallSats = stillCollecting ? Math.max(0, expectedSats - confirmedSats) : 0;

    return {
      status,
      confirmations: intent?.confirmations ?? 0,
      requiredConfirmations: this.requiredConfirmations,
      underpaid: intent?.underpaid ?? false,
      overpaid: intent?.overpaid ?? false,
      expectedSats,
      confirmedSats,
      shortfallSats,
      topUpUri: shortfallSats > 0 && intent ? toBip21(intent.address, shortfallSats) : null,
    };
  }
}
