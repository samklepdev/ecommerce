import type { UseCase } from '@/shared/application/use-case';
import type { Supplier } from '@/modules/sourcing/domain/supplier';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

export class ListSuppliers implements UseCase<void, Supplier[]> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(): Promise<Supplier[]> {
    return this.suppliers.list();
  }
}
