import { describe, expect, it } from 'vitest';

import { DeleteSupplier } from './delete-supplier';
import { Supplier } from '@/modules/sourcing/domain/supplier';
import type {
  SupplierRepository,
  SupplierUsage,
} from '@/modules/sourcing/application/ports/supplier-repository';
import { isErr, isOk } from '@/shared/domain/result';

function makeSupplier(id: string) {
  return Supplier.create({
    id,
    name: 'Acme Sourcing',
    url: 'https://acme.example.com',
    notes: null,
    isActive: true,
  });
}

function makeFakeSuppliers(supplier: Supplier | null, usage: SupplierUsage) {
  const deleted: string[] = [];
  const repo: Partial<SupplierRepository> = {
    async findById() {
      return supplier;
    },
    async getUsage() {
      return usage;
    },
    async delete(id) {
      deleted.push(id);
    },
  };
  return { repo: repo as SupplierRepository, deleted };
}

describe('DeleteSupplier', () => {
  it('deletes a supplier nothing references', async () => {
    const { repo, deleted } = makeFakeSuppliers(makeSupplier('sup-1'), {
      offerCount: 0,
      supplierOrderCount: 0,
    });

    const result = await new DeleteSupplier(repo).execute({ id: 'sup-1' });

    expect(isOk(result)).toBe(true);
    expect(deleted).toEqual(['sup-1']);
  });

  // The DB has ON DELETE RESTRICT on both references, so this would fail as a
  // raw constraint error anyway. Checking first turns that into something an
  // admin can act on, and says which of the two is holding it.
  it('refuses while supplier offers still point at it', async () => {
    const { repo, deleted } = makeFakeSuppliers(makeSupplier('sup-1'), {
      offerCount: 3,
      supplierOrderCount: 0,
    });

    const result = await new DeleteSupplier(repo).execute({ id: 'sup-1' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({ code: 'supplier_in_use', offerCount: 3, supplierOrderCount: 0 });
    }
    expect(deleted).toEqual([]);
  });

  // Purchase history is never deletable — the same rule that stops a product
  // that has been ordered from being removed.
  it('refuses while supplier orders reference it, even with no offers left', async () => {
    const { repo, deleted } = makeFakeSuppliers(makeSupplier('sup-1'), {
      offerCount: 0,
      supplierOrderCount: 2,
    });

    const result = await new DeleteSupplier(repo).execute({ id: 'sup-1' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({ code: 'supplier_in_use', offerCount: 0, supplierOrderCount: 2 });
    }
    expect(deleted).toEqual([]);
  });

  it('reports a supplier that no longer exists rather than reporting success', async () => {
    const { repo, deleted } = makeFakeSuppliers(null, { offerCount: 0, supplierOrderCount: 0 });

    const result = await new DeleteSupplier(repo).execute({ id: 'gone' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('not_found');
    expect(deleted).toEqual([]);
  });
});
