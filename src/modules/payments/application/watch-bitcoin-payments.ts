import { logger } from '@/shared/infrastructure/logger';
import type {
  BitcoinPaymentStore,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';
import type { ConfirmPayment } from '@/modules/orders/application/use-cases/confirm-payment';
import type { MarkAwaitingConfirmation } from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';

const DUST_TOLERANCE_SATS = 1000;

/**
 * Polls each awaiting intent's address and drives ConfirmPayment once enough
 * confirmations are seen. This is the ONLY path to `paid` — no webhook for
 * on-chain BTC by design. Reconciles from chain state each pass, so a restart
 * never loses a payment: confirmations just arrive a cycle late.
 */
export class WatchBitcoinPayments {
  constructor(
    private readonly paymentStore: BitcoinPaymentStore,
    private readonly chain: ChainDataProvider,
    private readonly confirmPayment: ConfirmPayment,
    private readonly markAwaitingConfirmation: MarkAwaitingConfirmation,
    private readonly requiredConfirmations: number,
  ) {}

  async runOnce(): Promise<void> {
    const intents = await this.paymentStore.listWatchable();

    for (const intent of intents) {
      try {
        const status = await this.chain.getStatus(intent.address);
        const underpaid = status.confirmedSats < intent.expectedSats - DUST_TOLERANCE_SATS;

        // Persisted every pass (all 3 branches below), not just the
        // underpaid one — otherwise a later top-up that goes straight to
        // full-confirm would leave a stale underpaid flag on a paid order.
        await this.paymentStore.recordProgress(intent.orderId, {
          confirmations: status.confirmations,
          underpaid,
        });

        // Underpayment is not payment — stays awaiting_confirmation for
        // manual review, never auto-fulfilled. Still recorded as "seen"
        // rather than left indistinguishable from "hasn't paid at all."
        if (underpaid) {
          await this.markAwaitingConfirmation.execute({ orderId: intent.orderId });
          continue;
        }

        if (status.confirmations < this.requiredConfirmations) {
          // Seen on-chain but shallow — track it, but never auto-fulfill.
          await this.markAwaitingConfirmation.execute({ orderId: intent.orderId });
          continue;
        }

        await this.confirmPayment.execute({
          orderId: intent.orderId,
          // Stable per order so a re-poll of the same settled state de-dupes
          // via ProcessedEventStore even if ConfirmPayment succeeded but this
          // process crashed before markConfirmed below.
          eventId: `btc-confirmed:${intent.orderId}`,
          confirmedSats: status.confirmedSats,
        });
        await this.paymentStore.markConfirmed(intent.orderId);
      } catch (e) {
        logger.error('watch-bitcoin-payments pass failed for intent', {
          orderId: intent.orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
