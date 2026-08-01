import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { BitcoinPaymentIntent } from '@/modules/payments/application/ports/bitcoin-ports';
import type { ConfirmPayment } from './confirm-payment';

/** Narrowed to the two methods this needs, rather than the whole
 * `BitcoinPaymentStore` — the same shape `ExpireStaleCheckouts` uses. */
export interface CreditablePaymentStore {
  getByOrderId(orderId: string): Promise<BitcoinPaymentIntent | null>;
  markConfirmed(orderId: string): Promise<void>;
}

export interface CreditLatePaymentInput {
  orderId: string;
}

export type CreditLatePaymentError =
  | { code: 'order_not_found' }
  /** Nothing was ever seen at this address after the order closed. */
  | { code: 'no_payment_to_credit' }
  /** The order isn't one the watcher has given up on. */
  | { code: 'not_creditable' };

/**
 * Credits bitcoin that arrived against an order the shop had already closed.
 *
 * `PAYMENT_TRANSITIONS` has always had `expired -> paid` and
 * `cancelled -> paid`, with comments explaining that a payment turning up
 * anyway must be recordable rather than stranded. Those edges were
 * unreachable: `listWatchable` stops returning an intent the moment its order
 * closes, and `ConfirmPayment`'s only caller was the watcher. So money the
 * sweep had already found and put on the dashboard could be seen and counted
 * but never credited, and putting it right meant hand-written SQL against
 * production.
 *
 * Deliberately **not** automatic. `SweepLatePayments` refuses to settle these
 * itself, because resurrecting a closed order because coins turned up makes a
 * business decision by accident — the customer may have been told the order
 * was dead, and the goods may no longer be obtainable at that price. This is
 * that decision, made by a person, with the amount in front of them.
 *
 * What it is not is a way to mark an arbitrary order paid: it credits only
 * what `SweepLatePayments` actually observed on-chain, and only on an order
 * the watcher has stopped looking at.
 */
export class CreditLatePayment
  implements
    UseCase<CreditLatePaymentInput, Result<{ creditedSats: number }, CreditLatePaymentError>>
{
  constructor(
    private readonly payments: CreditablePaymentStore,
    private readonly orders: ConfirmPaymentOrderRepository,
    private readonly confirmPayment: ConfirmPayment,
  ) {}

  async execute(
    input: CreditLatePaymentInput,
  ): Promise<Result<{ creditedSats: number }, CreditLatePaymentError>> {
    const intent = await this.payments.getByOrderId(input.orderId);
    if (!intent) return err({ code: 'order_not_found' });

    // Only money that was actually seen on-chain. `latePaymentSats` is
    // written by `SweepLatePayments` from a real Esplora read, which is what
    // keeps this from being "mark this order paid because I say so".
    const creditedSats = intent.latePaymentSats ?? 0;
    if (creditedSats <= 0) return err({ code: 'no_payment_to_credit' });

    const status = await this.orders.getPaymentStatus(input.orderId);
    // Only the two states the watcher has given up on. An order still
    // collecting will settle on its own, and crediting it by hand would
    // bypass the confirmation threshold; `paid` is terminal.
    if (status !== 'expired' && status !== 'cancelled') return err({ code: 'not_creditable' });

    // Reuses the one path to `paid`, so this gets the same recovery record,
    // the same guarded write, and the same sourcing enqueue a normal
    // settlement would. The event id is stable per order: pressing the button
    // twice credits once.
    await this.confirmPayment.execute({
      orderId: input.orderId,
      eventId: `late-payment-credited:${input.orderId}`,
    });

    // Drops the intent out of `listSweepable`, so a credited payment stops
    // being reported as an unexplained balance.
    await this.payments.markConfirmed(input.orderId);

    return ok({ creditedSats });
  }
}
