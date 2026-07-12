import { and, eq, lt, or, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { supplierOffers } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import { SupplierOffer, type SupplierOfferSyncStatus } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';
import type { ScrapedListing } from '@/modules/sourcing/application/ports/supplier-page-fetcher';

type SupplierOfferRow = typeof supplierOffers.$inferSelect;

function toOffer(row: SupplierOfferRow): SupplierOffer {
  return SupplierOffer.create({
    id: row.id,
    variantId: row.variantId,
    supplierId: row.supplierId,
    supplierProductUrl: row.supplierProductUrl,
    cost: Money.of(row.costAmountMinor, row.costCurrency),
    isAvailable: row.isAvailable,
    isPreferred: row.isPreferred,
    lastSyncedAt: row.lastSyncedAt,
    lastSyncStatus: row.lastSyncStatus as SupplierOfferSyncStatus,
    lastSyncError: row.lastSyncError,
    autoSyncEnabled: row.autoSyncEnabled,
    scrapedTitle: row.scrapedTitle,
  });
}

export class DrizzleSupplierOfferRepository implements SupplierOfferRepository {
  constructor(private readonly db: DB) {}

  async create(offer: SupplierOffer): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (offer.isPreferred) {
        await tx
          .update(supplierOffers)
          .set({ isPreferred: false, updatedAt: new Date() })
          .where(
            and(eq(supplierOffers.variantId, offer.variantId), eq(supplierOffers.isPreferred, true)),
          );
      }
      await tx.insert(supplierOffers).values({
        id: offer.id,
        variantId: offer.variantId,
        supplierId: offer.supplierId,
        supplierProductUrl: offer.supplierProductUrl,
        costAmountMinor: offer.cost.amountMinor,
        costCurrency: offer.cost.currency,
        isAvailable: offer.isAvailable,
        isPreferred: offer.isPreferred,
      });
    });
  }

  async setPreferred(offerId: string, variantId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(supplierOffers)
        .set({ isPreferred: false, updatedAt: new Date() })
        .where(and(eq(supplierOffers.variantId, variantId), eq(supplierOffers.isPreferred, true)));
      await tx
        .update(supplierOffers)
        .set({ isPreferred: true, updatedAt: new Date() })
        .where(eq(supplierOffers.id, offerId));
    });
  }

  async findPreferredByVariantId(variantId: string): Promise<SupplierOffer | null> {
    const row = await this.db.query.supplierOffers.findFirst({
      where: and(eq(supplierOffers.variantId, variantId), eq(supplierOffers.isPreferred, true)),
    });
    return row ? toOffer(row) : null;
  }

  async listByVariantId(variantId: string): Promise<SupplierOffer[]> {
    const rows = await this.db.query.supplierOffers.findMany({
      where: eq(supplierOffers.variantId, variantId),
    });
    return rows.map(toOffer);
  }

  async findById(offerId: string): Promise<SupplierOffer | null> {
    const row = await this.db.query.supplierOffers.findFirst({
      where: eq(supplierOffers.id, offerId),
    });
    return row ? toOffer(row) : null;
  }

  async listDueForSync(intervalHours: number): Promise<SupplierOffer[]> {
    const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000);
    const rows = await this.db.query.supplierOffers.findMany({
      where: and(
        eq(supplierOffers.autoSyncEnabled, true),
        or(sql`${supplierOffers.lastSyncedAt} IS NULL`, lt(supplierOffers.lastSyncedAt, cutoff)),
      ),
    });
    return rows.map(toOffer);
  }

  async setAutoSyncEnabled(offerId: string, enabled: boolean): Promise<void> {
    await this.db
      .update(supplierOffers)
      .set({ autoSyncEnabled: enabled, updatedAt: new Date() })
      .where(eq(supplierOffers.id, offerId));
  }

  async recordSyncSuccess(offerId: string, listing: ScrapedListing): Promise<void> {
    await this.db
      .update(supplierOffers)
      .set({
        costAmountMinor: listing.priceMinor,
        costCurrency: listing.currency,
        isAvailable: listing.available,
        scrapedTitle: listing.title,
        lastSyncedAt: new Date(),
        lastSyncStatus: 'ok',
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(supplierOffers.id, offerId));
  }

  async recordSyncFailure(
    offerId: string,
    status: 'blocked' | 'error',
    message: string,
  ): Promise<void> {
    await this.db
      .update(supplierOffers)
      .set({
        lastSyncedAt: new Date(),
        lastSyncStatus: status,
        lastSyncError: message,
        updatedAt: new Date(),
      })
      .where(eq(supplierOffers.id, offerId));
  }
}
