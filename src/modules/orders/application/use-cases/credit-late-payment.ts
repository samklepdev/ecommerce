import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { ConfirmPaymentOrderRepository } from '@/modules/orders/application/ports/order-repository';
import type { BitcoinPaymentIntent } from '@/modules/payments/application/ports/bitcoin-ports';
import { isLatePaymentCreditable } from '@/modules/orders/domain/order-status';
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
  | { code: 'not_creditable' }
  /**
   * The credit did not apply — the order moved underneath this call, most
   * likely the watcher settling it first. Nothing is wrong with the outcome,
   * but this call didn't cause it and must not be audited as though it had.
   */
  | { code: 'not_credited' };

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
    /**
     * Only the states the watcher has given up on. An order still collecting
     * will settle on its own, and crediting it by hand would bypass the
     * confirmation threshold; `paid` is terminal.
     *
     * `failed` is in the list and matters most: it is where an underpaid order
     * ends up once the top-up window closes, which makes it the likeliest
     * place for the balance to arrive late. Leaving it out meant the sweep
     * found the coins, the dashboard counted them, and the admin opening the
     * order had no action at all.
     */
    if (status === null || !isLatePaymentCreditable(status)) {
      return err({ code: 'not_creditable' });
    }

    // Reuses the one path to `paid`, so this gets the same recovery record,
    // the same guarded write, and the same sourcing enqueue a normal
    // settlement would. The event id is stable per order: pressing the button
    // twice credits once.
    await this.confirmPayment.execute({
      orderId: input.orderId,
      eventId: `late-payment-credited:${input.orderId}`,
    });

    /**
     * Confirm it actually landed before reporting success.
     *
     * `ConfirmPayment` returns `void` and has three silent early exits — the
     * event id already seen, the order gone, and a lost compare-and-set (the
     * watcher settling the same order between the read above and the write).
     * Reporting `ok` regardless meant the action wrote an
     * `order.late_payment_credited` audit entry and told the admin an amount
     * had been credited for something this call had not done. The audit log is
     * the record of who authorised moving money; an entry for a credit that
     * didn't happen here is worse than no entry.
     */
    const after = await this.orders.getPaymentStatus(input.orderId);
    if (after !== 'paid') return err({ code: 'not_credited' });

    // Drops the intent out of `listSweepable`, so a credited payment stops
    // being reported as an unexplained balance. Only once the order really is
    // paid — otherwise this would hide money that is still unexplained.
    await this.payments.markConfirmed(input.orderId);

    return ok({ creditedSats });
  }
}
