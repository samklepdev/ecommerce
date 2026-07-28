import { count as countRows, eq } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { supplierOffers, supplierOrders, suppliers } from '@/shared/infrastructure/db/schema';
import { Supplier } from '@/modules/sourcing/domain/supplier';
import type {
  SupplierRepository,
  SupplierUsage,
  SupplierWithUsage,
} from '@/modules/sourcing/application/ports/supplier-repository';

type SupplierRow = typeof suppliers.$inferSelect;

function toSupplier(row: SupplierRow): Supplier {
  return Supplier.create({
    id: row.id,
    name: row.name,
    url: row.url,
    notes: row.notes,
    isActive: row.isActive,
  });
}

export class DrizzleSupplierRepository implements SupplierRepository {
  constructor(private readonly db: DB) {}

  async list(): Promise<Supplier[]> {
    const rows = await this.db.query.suppliers.findMany();
    return rows.map(toSupplier);
  }

  async listWithUsage(): Promise<SupplierWithUsage[]> {
    // Two grouped counts joined back onto the supplier list, rather than a
    // pair of queries per row. Left joins so a supplier nothing references
    // still appears, with zeroes.
    const offerCounts = this.db
      .select({
        supplierId: supplierOffers.supplierId,
        count: countRows().as('offer_count'),
      })
      .from(supplierOffers)
      .groupBy(supplierOffers.supplierId)
      .as('offer_counts');

    const orderCounts = this.db
      .select({
        supplierId: supplierOrders.supplierId,
        count: countRows().as('order_count'),
      })
      .from(supplierOrders)
      .groupBy(supplierOrders.supplierId)
      .as('order_counts');

    const rows = await this.db
      .select({
        supplier: suppliers,
        offerCount: offerCounts.count,
        supplierOrderCount: orderCounts.count,
      })
      .from(suppliers)
      .leftJoin(offerCounts, eq(offerCounts.supplierId, suppliers.id))
      .leftJoin(orderCounts, eq(orderCounts.supplierId, suppliers.id));

    return rows.map((r) => ({
      supplier: toSupplier(r.supplier),
      usage: {
        offerCount: Number(r.offerCount ?? 0),
        supplierOrderCount: Number(r.supplierOrderCount ?? 0),
      },
    }));
  }

  async findById(id: string): Promise<Supplier | null> {
    const row = await this.db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
    return row ? toSupplier(row) : null;
  }

  async getUsage(id: string): Promise<SupplierUsage> {
    const [offers, orders] = await Promise.all([
      this.db
        .select({ count: countRows() })
        .from(supplierOffers)
        .where(eq(supplierOffers.supplierId, id)),
      this.db
        .select({ count: countRows() })
        .from(supplierOrders)
        .where(eq(supplierOrders.supplierId, id)),
    ]);
    return {
      offerCount: Number(offers[0]?.count ?? 0),
      supplierOrderCount: Number(orders[0]?.count ?? 0),
    };
  }

  async create(supplier: Supplier): Promise<void> {
    await this.db.insert(suppliers).values({
      id: supplier.id,
      name: supplier.name,
      url: supplier.url,
      notes: supplier.notes,
    });
  }

  async update(id: string, details: { name: string; url: string; notes: string | null }): Promise<void> {
    await this.db
      .update(suppliers)
      .set({ name: details.name, url: details.url, notes: details.notes, updatedAt: new Date() })
      .where(eq(suppliers.id, id));
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db.update(suppliers).set({ isActive, updatedAt: new Date() }).where(eq(suppliers.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(suppliers).where(eq(suppliers.id, id));
  }
}
