import { describe, expect, it } from 'vitest';

import { UpdateSupplier } from './update-supplier';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

describe('UpdateSupplier', () => {
  it('delegates to the repository', async () => {
    const calls: { id: string; name: string; url: string; notes: string | null }[] = [];
    const repo: Partial<SupplierRepository> = {
      async update(id, details) {
        calls.push({ id, ...details });
      },
    };

    await new UpdateSupplier(repo as SupplierRepository).execute({
      id: 's1',
      name: 'New Name',
      url: 'https://new.example.com',
      notes: 'updated',
    });

    expect(calls).toEqual([{ id: 's1', name: 'New Name', url: 'https://new.example.com', notes: 'updated' }]);
  });

  it('allows clearing notes with null', async () => {
    const calls: (string | null)[] = [];
    const repo: Partial<SupplierRepository> = {
      async update(_id, details) {
        calls.push(details.notes);
      },
    };

    await new UpdateSupplier(repo as SupplierRepository).execute({
      id: 's1',
      name: 'Name',
      url: 'https://example.com',
      notes: null,
    });

    expect(calls).toEqual([null]);
  });
});
