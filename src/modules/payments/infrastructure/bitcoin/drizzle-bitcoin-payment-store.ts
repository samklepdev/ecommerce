import { and, count, eq, gt, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';

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

export class DrizzleBitcoinPaymentStore implements BitcoinPaymentStore, OnChainActivityReportRepository {
  constructor(private readonly db: DB) {}

  async listConfirmedWithOrderInfo(since: Date, until: Date): Promise<OnChainOrderActivity[]> {
    const rows = await this.db
      .select({
        orderId: orders.id,
        address: bitcoinPaymentIntents.address,
        expectedSats: bitcoinPaymentIntents.expectedSats,
        underpaid: bitcoinPaymentIntents.underpaid,
        overpaid: bitcoinPaymentIntents.overpaid,
        confirmations: bitcoinPaymentIntents.confirmations,
        paidAt: orders.updatedAt,
      })
      .from(bitcoinPaymentIntents)
      .innerJoin(orders, eq(orders.id, bitcoinPaymentIntents.orderId))
      .where(
        and(
          eq(orders.paymentStatus, 'paid'),
          gte(orders.updatedAt, since),
          lte(orders.updatedAt, until),
        ),
      );
    return rows;
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

  /** Awaiting intents whose quote hasn't expired — the watcher polls these. */
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
          gt(orders.paymentDeadlineAt, cutoff),
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
    // `inArray` on the two closed states rather than `ne('awaiting')`: an
    // intent that is `confirmed` was paid through the normal path and has
    // nothing to explain, and lumping it in would re-query every settled
    // order's address forever.
    const rows = await this.db
      .select()
      .from(bitcoinPaymentIntents)
      .where(
        and(
          inArray(bitcoinPaymentIntents.status, ['expired', 'cancelled']),
          gte(bitcoinPaymentIntents.createdAt, createdSince),
          isNull(bitcoinPaymentIntents.latePaymentSeenAt),
        ),
      );
    return rows.map(toIntent);
  }

  async recordLatePayment(orderId: string, sats: number): Promise<void> {
    // Guarded on `latePaymentSeenAt IS NULL` so this is write-once: a second
    // sweep must not move the timestamp and make the discovery look fresh.
    await this.db
      .update(bitcoinPaymentIntents)
      .set({ latePaymentSats: sats, latePaymentSeenAt: new Date() })
      .where(
        and(
          eq(bitcoinPaymentIntents.orderId, orderId),
          isNull(bitcoinPaymentIntents.latePaymentSeenAt),
        ),
      );
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
    progress: { confirmations: number; underpaid: boolean; overpaid: boolean },
  ): Promise<void> {
    await this.db
      .update(bitcoinPaymentIntents)
      .set({
        confirmations: progress.confirmations,
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
    underpaid: row.underpaid,
    overpaid: row.overpaid,
  };
}
