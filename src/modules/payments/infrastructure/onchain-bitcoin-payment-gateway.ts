import { err, ok, type Result } from '@/shared/domain/result';
import type {
  CreatePaymentError,
  CreatePaymentInput,
  CreatePaymentOutput,
  PaymentGateway,
  RepricePaymentError,
  RepricePaymentInput,
  RepricePaymentOutput,
} from '@/modules/payments/application/ports/payment-gateway';
import type {
  AddressIndexAllocator,
  BitcoinPaymentStore,
  BtcRateProvider,
  ChainDataProvider,
} from '@/modules/payments/application/ports/bitcoin-ports';
import type { HdAddressDeriver } from '@/modules/payments/infrastructure/bitcoin/address-deriver';
import { toBip21 } from '@/modules/payments/domain/bip21';
import { logger } from '@/shared/infrastructure/logger';

export class OnChainBitcoinPaymentGateway implements PaymentGateway {
  readonly method = 'crypto' as const;

  constructor(
    private readonly deriver: HdAddressDeriver,
    private readonly indexAllocator: AddressIndexAllocator,
    private readonly rates: BtcRateProvider,
    private readonly paymentStore: BitcoinPaymentStore,
    /** Read before repricing, to refuse restating an amount a customer may
     * already have paid. Not used to create a payment — there is nothing at a
     * freshly derived address to look at. */
    private readonly chain: ChainDataProvider,
    private readonly quoteTtlSeconds: number,
  ) {}

  /** Memoized: the floor only has to be established once per process. */
  private indexFloorEnsured: Promise<void> | null = null;

  /**
   * Raise the Redis counter to the highest index the database has ever
   * persisted, before allocating anything.
   *
   * `INCR` on a missing key starts at 1, so a wiped or evicted counter
   * silently restarts allocation at index 0 and re-derives addresses that
   * previous orders already used — the one thing CLAUDE.md calls out as
   * destroying order↔payment correlation. Managed Redis is commonly
   * provisioned with an eviction policy, so "the key is always there" is not
   * a safe assumption.
   *
   * Doing it here rather than in a boot script means it cannot be forgotten:
   * every process that can allocate an address goes through this method
   * first. A failure is logged and allowed through — the unique constraint
   * on `address` is the backstop, and refusing all checkouts because the
   * high-water query failed would be the worse outcome.
   */
  private async ensureIndexFloor(): Promise<void> {
    this.indexFloorEnsured ??= (async () => {
      try {
        const highest = await this.paymentStore.highestAddressIndex();
        if (highest !== null) await this.indexAllocator.seedFloor(highest + 1);
      } catch (e) {
        logger.error('could not seed the address-index floor; allocation continues', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return this.indexFloorEnsured;
  }

  async createPayment(
    input: CreatePaymentInput,
  ): Promise<Result<CreatePaymentOutput, CreatePaymentError>> {
    // Idempotent: a double-submit for the same order returns the existing intent.
    const existing = await this.paymentStore.getByOrderId(input.orderId);
    if (existing) {
      return ok({
        reference: existing.address,
        bip21Uri: toBip21(existing.address, existing.expectedSats),
        expiresAt: existing.expiresAt,
        expectedSats: existing.expectedSats,
      });
    }

    try {
      await this.ensureIndexFloor();
      const index = await this.indexAllocator.next();
      const address = this.deriver.deriveAddress(index);
      const satsPerFiatUnit = await this.rates.satsPerFiatUnit(input.amount.currency);
      // Assumes a 2-decimal-place fiat currency (minor unit = 1/100 major unit),
      // true for USD/EUR/etc — revisit if a 0- or 3-decimal currency is added.
      const expectedSats = Math.round((input.amount.amountMinor / 100) * satsPerFiatUnit);
      const expiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000);

      await this.paymentStore.save({
        orderId: input.orderId,
        address,
        addressIndex: index,
        expectedSats,
        fiatCurrency: input.amount.currency,
        satsPerFiatUnit,
        expiresAt,
        status: 'awaiting',
      });

      // Re-fetch rather than trusting what we just computed: `save()`'s
      // unique constraint on orderId means a concurrent request may have
      // already won and persisted its own intent, in which case this call's
      // save() silently no-op'd. Returning our own locally-derived address
      // in that case would hand the caller an address nobody is watching —
      // always return whatever actually ended up persisted.
      const persisted = await this.paymentStore.getByOrderId(input.orderId);
      if (!persisted) {
        return err({ code: 'gateway_error', message: 'payment intent missing immediately after save' });
      }

      return ok({
        reference: persisted.address,
        bip21Uri: toBip21(persisted.address, persisted.expectedSats),
        expiresAt: persisted.expiresAt,
        expectedSats: persisted.expectedSats,
      });
    } catch (e) {
      return err({ code: 'gateway_error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async repricePayment(
    input: RepricePaymentInput,
  ): Promise<Result<RepricePaymentOutput, RepricePaymentError>> {
    const existing = await this.paymentStore.getByOrderId(input.orderId);
    // No intent yet (the order never reached checkout) — nothing to restate,
    // and the amount will be quoted correctly whenever checkout does run.
    if (!existing) return ok({ expiresAt: null, expectedSats: null });

    if (existing.status !== 'awaiting') return err({ code: 'payment_not_repriceable' });

    try {
      // Ask the chain, not our own status columns.
      //
      // The order's payment status only advances on *confirmed* value, so for
      // the whole zero-conf window a customer who has already broadcast still
      // reads `awaiting_payment` — which is exactly the state every caller
      // here treats as safe to reprice. Restating the amount then moves the
      // goalposts under a payment in flight: if the rate fell, their full
      // payment lands as an underpayment, they're emailed a demand for a
      // balance they don't owe, and at 48 hours the order goes terminal with
      // no refund path.
      //
      // The watcher now moves an order to `awaiting_confirmation` on mempool
      // value, which closes most of this, but not the gap between a broadcast
      // and the next 45-second pass. This closes that gap. It costs one
      // Esplora call per re-quote, which is user-initiated and rare.
      const status = await this.chain.getStatus(existing.address, existing.expectedSats);
      if (status.confirmedSats + status.pendingSats > 0) {
        return err({ code: 'payment_in_flight' });
      }

      const satsPerFiatUnit = await this.rates.satsPerFiatUnit(input.amount.currency);
      // Same 2-decimal assumption as createPayment.
      const expectedSats = Math.round((input.amount.amountMinor / 100) * satsPerFiatUnit);
      const expiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000);

      // Same address, new amount. The rate lock restarts because the quote
      // is new — the customer is being asked for a different number than the
      // one they were shown, so they get a full window to act on it.
      await this.paymentStore.reprice(input.orderId, {
        expectedSats,
        satsPerFiatUnit,
        expiresAt,
      });

      // Read back for the same reason createPayment does: the store's write
      // is guarded on status, so a watcher pass that settled this payment
      // mid-flight leaves the row untouched and this would otherwise report
      // a change that never happened.
      const persisted = await this.paymentStore.getByOrderId(input.orderId);
      if (!persisted || persisted.expectedSats !== expectedSats) {
        return err({ code: 'payment_not_repriceable' });
      }

      return ok({ expiresAt: persisted.expiresAt, expectedSats: persisted.expectedSats });
    } catch (e) {
      return err({ code: 'gateway_error', message: e instanceof Error ? e.message : String(e) });
    }
  }
}
