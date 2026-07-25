import { describe, expect, it } from 'vitest';

import { SetSupplierActive } from './set-supplier-active';
import type { SupplierRepository } from '@/modules/sourcing/application/ports/supplier-repository';

describe('SetSupplierActive', () => {
  it('delegates to the repository', async () => {
    const calls: { id: string; isActive: boolean }[] = [];
    const repo: Partial<SupplierRepository> = {
      async setActive(id, isActive) {
        calls.push({ id, isActive });
      },
    };

    await new SetSupplierActive(repo as SupplierRepository).execute({ id: 's1', isActive: false });

    expect(calls).toEqual([{ id: 's1', isActive: false }]);
  });
});
