import { logger } from '@/shared/infrastructure/logger';
import type {
  BitcoinPaymentStore,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';
import type { ConfirmPayment } from '@/modules/orders/application/use-cases/confirm-payment';
import type { MarkAwaitingConfirmation } from '@/modules/orders/application/use-cases/mark-awaiting-confirmation';
import type { NotifyUnderpaidOnce } from '@/modules/orders/application/use-cases/notify-underpaid-once';

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
    private readonly notifyUnderpaid: NotifyUnderpaidOnce,
  ) {}

  async runOnce(): Promise<void> {
    const intents = await this.paymentStore.listWatchable();

    for (const intent of intents) {
      try {
        const status = await this.chain.getStatus(intent.address);
        // Nothing on-chain yet is not the same as a short payment, and the
        // difference matters: `underpaid` moves the order to
        // awaiting_confirmation, which puts it beyond the reach of both
        // ExpireStaleCheckouts and the customer's own cancel button. Without
        // this guard 0 < expected-dust is true, so every order that had
        // simply not been paid yet looked underpaid on the first pass.
        const seen = status.confirmedSats > 0;
        const underpaid = seen && status.confirmedSats < intent.expectedSats - DUST_TOLERANCE_SATS;
        // Not a gate like underpaid — they paid at least what was expected,
        // so fulfillment proceeds normally. Just a flag for admin/customer
        // visibility; what to do about the excess is an ops question, not a reason to
        // withhold shipping.
        const overpaid = status.confirmedSats > intent.expectedSats + DUST_TOLERANCE_SATS;

        // Persisted every pass (all 3 branches below), not just the
        // underpaid one — otherwise a later top-up that goes straight to
        // full-confirm would leave a stale underpaid flag on a paid order.
        await this.paymentStore.recordProgress(intent.orderId, {
          confirmations: status.confirmations,
          // Persisted, not just used to derive the two flags above. Those say
          // *that* something is wrong; this says by how much, which is the
          // only figure anyone can act on.
          confirmedSats: status.confirmedSats,
          underpaid,
          overpaid,
        });

        // Underpayment is not payment — stays awaiting_confirmation for
        // manual review, never auto-fulfilled. Still recorded as "seen"
        // rather than left indistinguishable from "hasn't paid at all."
        // Recorded above either way, so "we polled and saw nothing" is
        // distinguishable from "we never polled", but the order stays in
        // awaiting_payment where expiry and cancellation can still reach it.
        if (!seen) continue;

        if (underpaid) {
          await this.markAwaitingConfirmation.execute({ orderId: intent.orderId });
          // Only this branch, not the shallow-confirmation one below: a shallow
          // payment resolves itself in a few blocks and needs no action from
          // the customer, whereas a short one is stuck until they send the
          // rest. `NotifyUnderpaidOnce` owns the once-per-order guard, because
          // this pass runs every 45 seconds for as long as the order is short.
          await this.notifyUnderpaid.execute({
            orderId: intent.orderId,
            confirmedSats: status.confirmedSats,
          });
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
