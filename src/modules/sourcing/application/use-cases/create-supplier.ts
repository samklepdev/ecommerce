import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { Supplier } from '@/modules/sourcing/domain/supplier';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

export interface CreateSupplierInput {
  name: string;
  url: string;
  notes?: string | null;
}

export class CreateSupplier implements UseCase<CreateSupplierInput, Supplier> {
  constructor(private readonly suppliers: SupplierRepository) {}

  async execute(input: CreateSupplierInput): Promise<Supplier> {
    const supplier = Supplier.create({
      id: randomUUID(),
      name: input.name,
      url: input.url,
      notes: input.notes ?? null,
    });
    await this.suppliers.create(supplier);
    return supplier;
  }
}
