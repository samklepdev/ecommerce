import { and, eq } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { supplierOffers } from '@/shared/infrastructure/db/schema';
import { Money } from '@/shared/domain/money';
import { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import type { SupplierOfferRepository } from '@/modules/sourcing/application/ports/supplier-offer-repository';

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

  async updateCost(offerId: string, amountMinor: number, currency: string): Promise<void> {
    await this.db
      .update(supplierOffers)
      .set({ costAmountMinor: amountMinor, costCurrency: currency, updatedAt: new Date() })
      .where(eq(supplierOffers.id, offerId));
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
}
