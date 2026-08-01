import type { UseCase } from '@/shared/application/use-case';
import { logger } from '@/shared/infrastructure/logger';
import type {
  BitcoinPaymentStore,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';

/**
 * How far back to keep looking. An address doesn't stop existing when an order
 * closes, so without a bound this becomes a full wallet rescan every sweep.
 * Thirty days is chosen to outlast how long someone might take to notice they
 * were charged nothing and try again, not for any chain-level reason.
 */
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Finds money that arrived after we stopped looking for it.
 *
 * `listWatchable` returns an intent only while its status is `awaiting` and its
 * order deadline is in the future. That is correct for the confirmation path —
 * past the deadline the shop stops *promising* to honour the order — but it
 * also means the shop stops *looking*, and the address was still handed to a
 * real customer. Someone paying at hour 25, or paying after cancelling, sends
 * real bitcoin to an address nothing polls, against an order that will never
 * reach `paid`. Nothing else would ever notice: the on-chain report is built
 * from orders that are already `paid`, so it can't show what it never saw.
 *
 * This deliberately does **not** confirm the payment or move the order.
 * Whether late money becomes a fulfilled order, a top-up, or a conversation is
 * a business decision, and quietly resurrecting an expired order because coins
 * turned up would make that decision by accident. The job here is to ensure a
 * human finds out.
 *
 * Runs on a slow clock (hourly is plenty — nothing here is time-critical, and
 * it costs one provider call per recently-closed order).
 */
export class SweepLatePayments implements UseCase<void, void> {
  constructor(
    private readonly payments: BitcoinPaymentStore,
    private readonly chain: ChainDataProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<void> {
    const createdSince = new Date(this.now().getTime() - LOOKBACK_MS);
    const intents = await this.payments.listSweepable(createdSince);

    for (const intent of intents) {
      try {
        const status = await this.chain.getStatus(intent.address, intent.expectedSats);
        // Confirmed only: this flags money the shop is actually holding
        // against a closed order. Something still in the mempool isn't that
        // yet, and the next hourly pass will see it once it lands.
        if (status.confirmedSats <= 0) continue;

        const changed = await this.payments.recordLatePayment(
          intent.orderId,
          status.confirmedSats,
        );
        // Already-known and unchanged: stay quiet. This pass re-checks flagged
        // addresses every hour so a later top-up is noticed, and logging each
        // time would bury the new discoveries among the old ones.
        if (!changed) continue;

        // `error`, not `warn`: a customer is out of pocket with nothing to show
        // for it until somebody acts, which is the most serious state this
        // system can be in short of losing the database.
        logger.error('late payment found against a closed order', {
          orderId: intent.orderId,
          address: intent.address,
          intentStatus: intent.status,
          confirmedSats: status.confirmedSats,
          expectedSats: intent.expectedSats,
          confirmations: status.confirmations,
        });
      } catch (e) {
        // One unreachable address must not end the sweep — silently skipping
        // the rest is the exact failure this exists to prevent.
        logger.error('late-payment sweep failed for an intent', {
          orderId: intent.orderId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
