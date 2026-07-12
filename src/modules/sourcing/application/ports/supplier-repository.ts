import type { Supplier } from '@/modules/sourcing/domain/supplier';

export interface SupplierRepository {
  list(): Promise<Supplier[]>;
  findById(id: string): Promise<Supplier | null>;
  create(supplier: Supplier): Promise<void>;
}
