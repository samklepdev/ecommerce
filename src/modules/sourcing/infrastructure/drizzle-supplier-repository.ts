import { eq } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { suppliers } from '@/shared/infrastructure/db/schema';
import { Supplier } from '@/modules/sourcing/domain/supplier';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

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

  async findById(id: string): Promise<Supplier | null> {
    const row = await this.db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
    return row ? toSupplier(row) : null;
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
}
