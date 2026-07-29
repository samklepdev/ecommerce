import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { supplierOffers } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

type SupplierOfferRow = typeof supplierOffers.$inferSelect;

function toOffer(row: SupplierOfferRow): SupplierOffer {
  return SupplierOffer.create({
    id: row.id,
    productId: row.productId,
    supplierId: row.supplierId,
    supplierProductUrl: row.supplierProductUrl,
    cost: Money.of(row.costAmountMinor, row.costCurrency),
    isAvailable: row.isAvailable,
    isPreferred: row.isPreferred,
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
            and(eq(supplierOffers.productId, offer.productId), eq(supplierOffers.isPreferred, true)),
          );
      }
      await tx.insert(supplierOffers).values({
        id: offer.id,
        productId: offer.productId,
        supplierId: offer.supplierId,
        supplierProductUrl: offer.supplierProductUrl,
        costAmountMinor: offer.cost.amountMinor,
        costCurrency: offer.cost.currency,
        isAvailable: offer.isAvailable,
        isPreferred: offer.isPreferred,
      });
    });
  }

  async setPreferred(offerId: string, productId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(supplierOffers)
        .set({ isPreferred: false, updatedAt: new Date() })
        .where(and(eq(supplierOffers.productId, productId), eq(supplierOffers.isPreferred, true)));
      await tx
        .update(supplierOffers)
        .set({ isPreferred: true, updatedAt: new Date() })
        .where(eq(supplierOffers.id, offerId));
    });
  }

  async updateCost(offerId: string, amountMinor: number, currency: string): Promise<void> {
    await this.db
      .update(supplierOffers)
      .set({ costAmountMinor: amountMinor, costCurrency: currency, updatedAt: new Date() })
      .where(eq(supplierOffers.id, offerId));
  }

  async findPreferredByProductId(productId: string): Promise<SupplierOffer | null> {
    const row = await this.db.query.supplierOffers.findFirst({
      where: and(eq(supplierOffers.productId, productId), eq(supplierOffers.isPreferred, true)),
    });
    return row ? toOffer(row) : null;
  }

  async findSourceableByProductId(productId: string): Promise<SupplierOffer | null> {
    // Preferred first; otherwise the oldest offer, which is the one
    // `CreateSupplierOffer` would have marked preferred had the flag been set
    // properly. Ordering by cost would mean comparing amounts across
    // currencies, which Money exists to stop us doing.
    const row = await this.db.query.supplierOffers.findFirst({
      where: eq(supplierOffers.productId, productId),
      orderBy: [desc(supplierOffers.isPreferred), asc(supplierOffers.createdAt)],
    });
    return row ? toOffer(row) : null;
  }

  async listByProductId(productId: string): Promise<SupplierOffer[]> {
    const rows = await this.db.query.supplierOffers.findMany({
      where: eq(supplierOffers.productId, productId),
    });
    return rows.map(toOffer);
  }

  async listByProductIds(productIds: string[]): Promise<SupplierOffer[]> {
    if (productIds.length === 0) return [];
    const rows = await this.db.query.supplierOffers.findMany({
      where: inArray(supplierOffers.productId, productIds),
    });
    return rows.map(toOffer);
  }
}
