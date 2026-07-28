import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

export interface DeleteSupplierInput {
  id: string;
}

export type DeleteSupplierError =
  | { code: 'not_found' }
  | { code: 'supplier_in_use'; offerCount: number; supplierOrderCount: number };

/**
 * Removes a supplier outright — the counterpart to deactivating one, which
 * only hides it from "source from" pickers.
 *
 * Refuses while anything still references it. Both foreign keys are ON
 * DELETE RESTRICT, so the database would reject it regardless; checking here
 * turns an opaque constraint error into a message that says which of the two
 * is holding the supplier, and how much of it there is. Supplier orders in
 * particular are purchase history and are never deletable — deactivate
 * instead.
 */
export class DeleteSupplier
  implements UseCase<DeleteSupplierInput, Result<void, DeleteSupplierError>>
{
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: DeleteSupplierInput): Promise<Result<void, DeleteSupplierError>> {
    const supplier = await this.suppliers.findById(input.id);
    if (!supplier) return err({ code: 'not_found' });

    const usage = await this.suppliers.getUsage(input.id);
    if (usage.offerCount > 0 || usage.supplierOrderCount > 0) {
      return err({ code: 'supplier_in_use', ...usage });
    }

    await this.suppliers.delete(input.id);
    return ok(undefined);
  }
}
