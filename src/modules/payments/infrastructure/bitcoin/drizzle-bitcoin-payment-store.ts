import { and, count, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { bitcoinPaymentIntents, orders } from '@/shared/infrastructure/db/schema';
import { PAYMENT_EXPIRY_GRACE_MS } from '@/shared/domain/payment-expiry-grace';
import type {
  BitcoinPaymentIntent,
  BitcoinPaymentStore,
} from '@/modules/payments/application/ports/bitcoin-ports';
import type {
  OnChainActivityReportRepository,
  OnChainOrderActivity,
} from '@/modules/payments/application/use-cases/get-on-chain-activity-report';

/**
 * The forms an address might have been pasted in.
 *
 * Bech32 is case-insensitive by spec and some explorers render it upper-cased,
 * while every address this app derives is lower-case — so an admin copying
 * `TB1Q...` out of a block explorer would otherwise find nothing. Base58
 * (`1...`, `3...`) is emphatically **not** case-insensitive, and lowercasing
 * one would turn a valid address into a different, invalid string, so the
 * fallback is limited to the bech32 prefixes.
 */
function addressCandidates(address: string): string[] {
  const lower = address.toLowerCase();
  if (lower === address) return [address];
  return /^(bc1|tb1|bcrt1)/.test(lower) ? [address, lower] : [address];
}

export class DrizzleBitcoinPaymentStore implements BitcoinPaymentStore, OnChainActivityReportRepository {
  constructor(private readonly db: DB) {}

  async listConfirmedWithOrderInfo(since: Date, until: Date): Promise<OnChainOrderActivity[]> {
    const rows = await this.db
      .select({
        orderId: orders.id,
        address: bitcoinPaymentIntents.address,
        expectedSats: bitcoinPaymentIntents.expectedSats,
        confirmedSats: bitcoinPaymentIntents.confirmedSats,
        underpaid: bitcoinPaymentIntents.underpaid,
        overpaid: bitcoinPaymentIntents.overpaid,
        confirmations: bitcoinPaymentIntents.confirmations,
        /**
         * `paid_at`, not `updated_at`.
         *
         * This used to alias `updated_at`, which shipping, cancelling, editing
         * lines, updating contact details and recording a payment recovery all
         * rewrite. An order settled on 5 January and shipped on 10 February
         * therefore left January's report and appeared in February's — the
         * sats weren't missing, they were filed under the wrong month, and any
         * order still moving through fulfillment was invisible in the period
         * it was actually paid in. Reconciling against an exchange with that
         * is impossible.
         */
        paidAt: orders.paidAt,
      })
      .from(bitcoinPaymentIntents)
      .innerJoin(orders, eq(orders.id, bitcoinPaymentIntents.orderId))
      .where(
        and(
          eq(orders.paymentStatus, 'paid'),
          gte(orders.paidAt, since),
          lte(orders.paidAt, until),
        ),
      );

    // The range predicate above already excludes a NULL `paid_at`, but the
    // column is nullable and the report's type says otherwise. Narrowing here
    // rather than asserting keeps that a fact about the data instead of a
    // claim about it — a paid order that somehow has no paid-at is dropped
    // from the report rather than crashing it or reporting an Invalid Date.
    return rows.filter((r): r is OnChainOrderActivity => r.paidAt !== null);
  }

  async save(intent: BitcoinPaymentIntent): Promise<void> {
    await this.db
      .insert(bitcoinPaymentIntents)
      .values({
        orderId: intent.orderId,
        address: intent.address,
        addressIndex: intent.addressIndex,
        expectedSats: intent.expectedSats,
        fiatCurrency: intent.fiatCurrency,
        satsPerFiatUnit: intent.satsPerFiatUnit,
        expiresAt: intent.expiresAt,
        status: intent.status,
      })
      .onConflictDoNothing({ target: bitcoinPaymentIntents.orderId });
  }

  async getByOrderId(orderId: string): Promise<BitcoinPaymentIntent | null> {
    const row = await this.db.query.bitcoinPaymentIntents.findFirst({
      where: eq(bitcoinPaymentIntents.orderId, orderId),
    });
    return row ? toIntent(row) : null;
  }

  async findByAddress(address: string): Promise<BitcoinPaymentIntent | null> {
    const trimmed = address.trim();
    const row = await this.db.query.bitcoinPaymentIntents.findFirst({
      where: inArray(bitcoinPaymentIntents.address, addressCandidates(trimmed)),
    });
    return row ? toIntent(row) : null;
  }

  /** Intents the watcher polls: still `awaiting`, and either inside the order's
   * payment window or holding a part-payment that can still be topped up. */
  async listWatchable(): Promise<BitcoinPaymentIntent[]> {
    // Keyed on the ORDER's deadline, not the quote's expiry — this is the
    // whole reason the two clocks are separate. A customer whose 15-minute
    // quote lapsed can still send to the address they were given, and if
    // this stopped watching at quote expiry that payment would land on an
    // address nobody is polling: real bitcoin, arriving silently, against an
    // order that then expires underneath it.
    //
    // Same grace window as findExpiredAwaitingOrderIds, so an address is
    // never dropped from watching before its order can be expired.
    const cutoff = new Date(Date.now() - PAYMENT_EXPIRY_GRACE_MS);
    const rows = await this.db
      .select({ intent: bitcoinPaymentIntents })
      .from(bitcoinPaymentIntents)
      .innerJoin(orders, eq(orders.id, bitcoinPaymentIntents.orderId))
      .where(
        and(
          eq(bitcoinPaymentIntents.status, 'awaiting'),
          // The order must still be able to reach `paid`. Without this a
          // terminal order inside its payment window stayed watchable, and a
          // payment arriving against it threw `assertPaymentTransition` on
          // every pass — an error loop every 45 seconds, drowning out real ones.
          inArray(orders.paymentStatus, ['pending', 'awaiting_payment', 'awaiting_confirmation']),
          or(
            gt(orders.paymentDeadlineAt, cutoff),
            // Past the deadline but part-paid: keep watching so a top-up can
            // land. `findExpiredAwaitingOrderIds` only expires `pending` and
            // `awaiting_payment`, so an underpaid order stays open until
            // `FailStuckAwaitingConfirmationOrders` fails it at 48h — and
            // without this the address went unwatched for the whole gap
            // between the two, while the order was still inviting a top-up.
            //
            // No second horizon to keep in sync: the stuck-fail moves the
            // order out of `awaiting_confirmation`, and it drops out here.
            eq(orders.paymentStatus, 'awaiting_confirmation'),
          ),
        ),
      );
    return rows.map((r) => toIntent(r.intent));
  }

  async highestAddressIndex(): Promise<number | null> {
    const [row] = await this.db
      .select({ max: sql<number | null>`max(${bitcoinPaymentIntents.addressIndex})` })
      .from(bitcoinPaymentIntents);
    return row?.max ?? null;
  }

  async markConfirmed(orderId: string): Promise<void> {
    await this.db
      .update(bitcoinPaymentIntents)
      .set({ status: 'confirmed' })
      .where(eq(bitcoinPaymentIntents.orderId, orderId));
  }

  async markExpired(orderId: string): Promise<void> {
    await this.db
      .update(bitcoinPaymentIntents)
      .set({ status: 'expired' })
      .where(eq(bitcoinPaymentIntents.orderId, orderId));
  }

  async reprice(
    orderId: string,
    quote: { expectedSats: number; satsPerFiatUnit: number; expiresAt: Date },
  ): Promise<void> {
    // Address and addressIndex are deliberately untouched: this is the same
    // payment for a different amount, not a new one. Guarded to `awaiting`
    // so a race with the watcher can't restate a payment that just settled.
    await this.db
      .update(bitcoinPaymentIntents)
      .set({
        expectedSats: quote.expectedSats,
        satsPerFiatUnit: quote.satsPerFiatUnit,
        expiresAt: quote.expiresAt,
      })
      .where(
        and(
          eq(bitcoinPaymentIntents.orderId, orderId),
          eq(bitcoinPaymentIntents.status, 'awaiting'),
        ),
      );
  }

  async markCancelled(orderId: string): Promise<void> {
    await this.db
      .update(bitcoinPaymentIntents)
      .set({ status: 'cancelled' })
      .where(eq(bitcoinPaymentIntents.orderId, orderId));
  }

  async listSweepable(createdSince: Date): Promise<BitcoinPaymentIntent[]> {
    // Keyed on the **order's** terminal status, not the intent's.
    //
    // The intent's own status looks like the obvious choice and is wrong:
    // nothing marks the intent when an order *fails*. `FailOrder` and the
    // stuck-order pass both set only the order, so a failed order's intent
    // stays `awaiting` for good — and it had fallen out of `listWatchable` too,
    // leaving its address watched by nothing and swept by nothing. That is the
    // address the underpayment email tells the customer to send the balance to,
    // and `failed` is exactly where an underpaid order ends up.
    //
    // Reading the order instead covers expired, failed and cancelled uniformly,
    // and stays correct if a future terminal state forgets to touch the intent.
    // `confirmed` intents are excluded by the order being `paid`: settled
    // through the normal path, nothing to explain.
    const rows = await this.db
      .select({ intent: bitcoinPaymentIntents })
      .from(bitcoinPaymentIntents)
      .innerJoin(orders, eq(orders.id, bitcoinPaymentIntents.orderId))
      .where(
        and(
          inArray(orders.paymentStatus, ['expired', 'failed', 'cancelled']),
          gte(bitcoinPaymentIntents.createdAt, createdSince),
          // Deliberately **not** filtered on `latePaymentSeenAt IS NULL`. The
          // address stays spendable after an order closes — it is the one the
          // underpayment email told the customer to send the balance to — so
          // checking once and never again meant a later payment went unseen
          // and the recorded figure permanently understated what was held.
          // `recordLatePayment` reports whether anything actually changed, so
          // re-sweeping a known problem is silent.
        ),
      );
    return rows.map((r) => toIntent(r.intent));
  }

  async recordLatePayment(orderId: string, sats: number): Promise<boolean> {
    /**
     * Grow-only, and reports whether it actually changed anything.
     *
     * The amount can rise — a customer who was told to send a balance may send
     * it after the order closed — so this is not write-once. It must never
     * fall, though: a provider briefly reporting less should not rewrite the
     * record downwards, which the `<` guard prevents.
     *
     * `latePaymentSeenAt` is coalesced rather than overwritten, because it
     * answers "when did we find out". A top-up must not make a week-old
     * discovery look like it happened this hour.
     */
    const updated = await this.db
      .update(bitcoinPaymentIntents)
      .set({
        latePaymentSats: sats,
        latePaymentSeenAt: sql`coalesce(${bitcoinPaymentIntents.latePaymentSeenAt}, now())`,
      })
      .where(
        and(
          eq(bitcoinPaymentIntents.orderId, orderId),
          or(
            isNull(bitcoinPaymentIntents.latePaymentSats),
            lt(bitcoinPaymentIntents.latePaymentSats, sats),
          ),
        ),
      )
      .returning({ orderId: bitcoinPaymentIntents.orderId });
    return updated.length > 0;
  }

  async countLatePayments(): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(bitcoinPaymentIntents)
      .where(isNotNull(bitcoinPaymentIntents.latePaymentSeenAt));
    return row?.value ?? 0;
  }

  async recordProgress(
    orderId: string,
    progress: {
      confirmations: number;
      confirmedSats: number;
      pendingSats: number;
      underpaid: boolean;
      overpaid: boolean;
    },
  ): Promise<void> {
    await this.db
      .update(bitcoinPaymentIntents)
      .set({
        confirmations: progress.confirmations,
        confirmedSats: progress.confirmedSats,
        pendingSats: progress.pendingSats,
        underpaid: progress.underpaid,
        overpaid: progress.overpaid,
      })
      .where(eq(bitcoinPaymentIntents.orderId, orderId));
  }
}

type Row = typeof bitcoinPaymentIntents.$inferSelect;
function toIntent(row: Row): BitcoinPaymentIntent {
  return {
    orderId: row.orderId,
    address: row.address,
    addressIndex: row.addressIndex,
    expectedSats: row.expectedSats,
    fiatCurrency: row.fiatCurrency,
    satsPerFiatUnit: row.satsPerFiatUnit,
    expiresAt: row.expiresAt,
    status: row.status as BitcoinPaymentIntent['status'],
    confirmations: row.confirmations,
    confirmedSats: row.confirmedSats,
    pendingSats: row.pendingSats,
    underpaid: row.underpaid,
    overpaid: row.overpaid,
    latePaymentSats: row.latePaymentSats,
  };
}
