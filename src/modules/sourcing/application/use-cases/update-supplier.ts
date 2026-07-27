import type { UseCase } from '@/shared/application/use-case';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

export interface UpdateSupplierInput {
  id: string;
  name: string;
  url: string;
  notes: string | null;
}

/** Non-empty-name/valid-URL invariants are enforced by the action layer's
 * Zod schema, same convention as UpdateProduct. */
export class UpdateSupplier implements UseCase<UpdateSupplierInput, void> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: UpdateSupplierInput): Promise<void> {
    await this.suppliers.update(input.id, {
      name: input.name,
      url: input.url,
      notes: input.notes,
    });
  }
}
