import { describe, expect, it } from 'vitest';

import { DeleteSavedAddress } from './delete-saved-address';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

function makeFakeRepo(result: boolean) {
  const calls: { id: string; userId: string }[] = [];
  const repo: Partial<SavedAddressRepository> = {
    async delete(id, userId) {
      calls.push({ id, userId });
      return result;
    },
  };
  return { repo: repo as SavedAddressRepository, calls };
}

describe('DeleteSavedAddress', () => {
  it('succeeds and delegates ownership scoping to the repository', async () => {
    const { repo, calls } = makeFakeRepo(true);

    const result = await new DeleteSavedAddress(repo).execute({ id: 'addr-1', userId: 'user-1' });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ id: 'addr-1', userId: 'user-1' }]);
  });

  it('returns not_found when the repository reports no match', async () => {
    const { repo } = makeFakeRepo(false);

    const result = await new DeleteSavedAddress(repo).execute({ id: 'addr-1', userId: 'user-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });
});
