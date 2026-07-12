import { eq } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { suppliers } from '@/shared/infrastructure/db/schema';
import { Supplier } from '@/modules/sourcing/domain/supplier';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

type SupplierRow = typeof suppliers.$inferSelect;

function toSupplier(row: SupplierRow): Supplier {
  return Supplier.create({ id: row.id, name: row.name, url: row.url, notes: row.notes });
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
}
