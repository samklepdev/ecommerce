import { and, eq, gt } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { bitcoinPaymentIntents } from '@/shared/infrastructure/db/schema';
import { PAYMENT_EXPIRY_GRACE_MS } from '@/shared/domain/payment-expiry-grace';
import type {
  BitcoinPaymentIntent,
  BitcoinPaymentStore,
} from '@/modules/payments/application/ports/bitcoin-ports';

export class DrizzleBitcoinPaymentStore implements BitcoinPaymentStore {
  constructor(private readonly db: DB) {}

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
    const rows = await this.db.query.bitcoinPaymentIntents.findMany({
      where: and(
        eq(bitcoinPaymentIntents.status, 'awaiting'),
        // small grace window: keep polling briefly past expiry so a payment that
        // landed right at the deadline is still detected before we expire it.
        // Kept in sync with findExpiredAwaitingOrderIds's own grace period.
        gt(bitcoinPaymentIntents.expiresAt, new Date(Date.now() - PAYMENT_EXPIRY_GRACE_MS)),
      ),
    });
    return rows.map(toIntent);
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

  async markCancelled(orderId: string): Promise<void> {
    await this.db
      .update(bitcoinPaymentIntents)
      .set({ status: 'cancelled' })
      .where(eq(bitcoinPaymentIntents.orderId, orderId));
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
