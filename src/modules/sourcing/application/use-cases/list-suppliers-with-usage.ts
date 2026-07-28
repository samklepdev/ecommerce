import type { UseCase } from '@/shared/application/use-case';
import type {
  SupplierRepository,
  SupplierWithUsage,
} from '@/modules/sourcing/application/ports/supplier-repository';

/** The admin suppliers table: every supplier plus what references it, so a
 * row can show its footprint and say why it can't be deleted. `ListSuppliers`
 * stays the plain list used by pickers and filters. */
export class ListSuppliersWithUsage implements UseCase<void, SupplierWithUsage[]> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(): Promise<SupplierWithUsage[]> {
    return this.suppliers.listWithUsage();
  }
}
