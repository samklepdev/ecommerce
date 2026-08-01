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
        // `expectedSats` decides which transactions constitute the payment, so
        // dust arriving afterwards can't hold the confirmation depth at 1.
        const status = await this.chain.getStatus(intent.address, intent.expectedSats);

        // Four predicates, and which total each reads is the whole design.
        //
        // `seenSats` counts the mempool because "we can see it, it just isn't
        // safe yet" must hold the order open: a low-fee payment broadcast near
        // the deadline used to expire underneath the customer while it waited
        // for a block, and the lapsed-quote widget would then invite a re-quote
        // that repriced the payment already in flight.
        const seenSats = status.confirmedSats + status.pendingSats;

        /**
         * Nothing on-chain yet is not the same as a short payment, and the
         * difference matters: `underpaid` moves the order to
         * `awaiting_confirmation`, which puts it beyond the reach of both
         * `ExpireStaleCheckouts` and the customer's own cancel button. Without
         * this guard 0 < expected-dust is true, so every order that had simply
         * not been paid yet looked underpaid on the first pass.
         *
         * Floored at the dust tolerance rather than at zero, because
         * `awaiting_confirmation` is a one-way door: no cancel, no re-quote,
         * no benign expiry, and it starts the 48-hour clock that ends in
         * terminal `failed`. The address is public the moment the customer
         * pays — it is in the BIP21 QR before that — so a bare `> 0` let
         * anyone hold anyone else's order open with 546 satoshis. Anything
         * above the tolerance is a real payment and is treated as one.
         */
        const seen = seenSats > DUST_TOLERANCE_SATS;

        // Counts the mempool too, and must. This is the predicate that emails
        // someone "you still owe X" — reading confirmed-only here would fire
        // that at a customer who paid in full sixty seconds ago and is waiting
        // for their first confirmation.
        const underpaid = seen && seenSats < intent.expectedSats - DUST_TOLERANCE_SATS;

        // Confirmed-only, and the gate on settlement. Load-bearing precisely
        // because `underpaid` is not: 50k confirmed plus 50k pending against
        // 100k expected is not underpaid, but only half of it is actually
        // safe, so it must not be marked paid on the confirmed half's depth.
        const shortOfExpected = status.confirmedSats < intent.expectedSats - DUST_TOLERANCE_SATS;

        // Confirmed-only: an overpayment is a settled fact about money that
        // arrived, not a prediction. Not a gate like underpaid — they paid at
        // least what was expected, so fulfillment proceeds normally. Just a
        // flag for admin/customer visibility; what to do about the excess is an
        // ops question, not a reason to withhold shipping.
        const overpaid = status.confirmedSats > intent.expectedSats + DUST_TOLERANCE_SATS;

        // Persisted every pass (all 3 branches below), not just the
        // underpaid one — otherwise a later top-up that goes straight to
        // full-confirm would leave a stale underpaid flag on a paid order.
        await this.paymentStore.recordProgress(intent.orderId, {
          confirmations: status.confirmations,
          // Persisted, not just used to derive the flags above. Those say
          // *that* something is wrong; this says by how much, which is the
          // only figure anyone can act on.
          confirmedSats: status.confirmedSats,
          // Recorded so the customer's widget and the admin's order page can
          // say "we can see your payment" rather than "awaiting payment" at
          // someone who has already sent it.
          pendingSats: status.pendingSats,
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
            // What they've actually sent, mempool included, so the balance we
            // quote never asks twice for money already on its way. Also the
            // de-dupe key, so if a pending transaction is dropped the next pass
            // re-notifies with the corrected figure.
            seenSats,
          });
          continue;
        }

        if (shortOfExpected || status.confirmations < this.requiredConfirmations) {
          // Seen on-chain but not yet safe — either still shallow, or partly
          // still in the mempool. Track it, but never auto-fulfill.
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
