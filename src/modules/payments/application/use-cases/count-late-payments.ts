import type { UseCase } from '@/shared/application/use-case';
import type { BitcoinPaymentStore } from '@/modules/payments/application/ports/bitcoin-ports';

/**
 * How many closed orders have unexplained bitcoin against them.
 *
 * Expected to be zero. Non-zero means `SweepLatePayments` found money at an
 * address belonging to an order that had expired or been cancelled — a customer
 * paid and has nothing to show for it until somebody acts, so it belongs on the
 * dashboard rather than only in a log line.
 *
 * The count does not clear itself, deliberately. There is no "dismiss" action
 * because there is nothing to dismiss: the money is still there until it's
 * resolved, and a tile that quietly stopped nagging would be worse than no
 * tile.
 */
export class CountLatePayments implements UseCase<void, number> {
  constructor(private readonly payments: BitcoinPaymentStore) {}

  execute(): Promise<number> {
    return this.payments.countLatePayments();
  }
}
