import type { Supplier } from '@/modules/sourcing/domain/supplier';

export interface SupplierRepository {
  /** All suppliers, active and inactive — for admin management/filtering. */
  list(): Promise<Supplier[]>;
  findById(id: string): Promise<Supplier | null>;
  create(supplier: Supplier): Promise<void>;
  update(id: string, details: { name: string; url: string; notes: string | null }): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
}
