import type { UseCase } from '@/shared/application/use-case';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

export interface SetSupplierActiveInput {
  id: string;
  isActive: boolean;
}

/** Deactivating a supplier drops it out of "source from" dropdowns (new
 * product, new supplier offer) without touching any existing offers or
 * orders that already reference it. */
export class SetSupplierActive implements UseCase<SetSupplierActiveInput, void> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: SetSupplierActiveInput): Promise<void> {
    await this.suppliers.setActive(input.id, input.isActive);
  }
}
