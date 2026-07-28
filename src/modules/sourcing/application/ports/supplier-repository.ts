import type { Supplier } from '@/modules/sourcing/domain/supplier';

/** What still points at a supplier. Both counts carry an ON DELETE RESTRICT
 * in the schema, so they're also exactly what makes a supplier undeletable. */
export interface SupplierUsage {
  /** Catalog offers sourcing a product from this supplier. */
  offerCount: number;
  /** Purchase history — orders we placed with them. Never deletable. */
  supplierOrderCount: number;
}

export interface SupplierWithUsage {
  supplier: Supplier;
  usage: SupplierUsage;
}

export interface SupplierRepository {
  /** All suppliers, active and inactive — for admin management/filtering. */
  list(): Promise<Supplier[]>;
  /** Same list, plus what references each one — so the admin table can show
   * a supplier's footprint and explain why one can't be deleted, without a
   * query per row. */
  listWithUsage(): Promise<SupplierWithUsage[]>;
  findById(id: string): Promise<Supplier | null>;
  getUsage(id: string): Promise<SupplierUsage>;
  create(supplier: Supplier): Promise<void>;
  update(id: string, details: { name: string; url: string; notes: string | null }): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
  /** Hard delete. Callers must check `getUsage` first — the DB restricts it
   * anyway, but a constraint error isn't something an admin can act on. */
  delete(id: string): Promise<void>;
}
