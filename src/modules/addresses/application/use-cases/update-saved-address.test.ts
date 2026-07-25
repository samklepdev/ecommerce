import { describe, expect, it } from 'vitest';

import { UpdateSavedAddress } from './update-saved-address';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

function makeRepo(matches: boolean) {
  const calls: unknown[] = [];
  const repo: Partial<SavedAddressRepository> = {
    async update(id, userId, details) {
      calls.push({ id, userId, details });
      return matches;
    },
  };
  return { repo: repo as SavedAddressRepository, calls };
}

describe('UpdateSavedAddress', () => {
  it('updates the address fields for the owning user', async () => {
    const { repo, calls } = makeRepo(true);

    const result = await new UpdateSavedAddress(repo).execute({
      id: 'addr1',
      userId: 'user1',
      name: 'Home',
      line1: '1 Main St',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    });

    expect(result).toBe(true);
    expect(calls).toEqual([
      {
        id: 'addr1',
        userId: 'user1',
        details: {
          name: 'Home',
          line1: '1 Main St',
          line2: undefined,
          city: 'Springfield',
          region: 'IL',
          postalCode: '62701',
          country: 'US',
        },
      },
    ]);
  });

  it('returns false when the address does not belong to the user (or does not exist)', async () => {
    const { repo } = makeRepo(false);

    const result = await new UpdateSavedAddress(repo).execute({
      id: 'addr1',
      userId: 'someone-else',
      name: 'Home',
      line1: '1 Main St',
      city: 'Springfield',
      region: 'IL',
      postalCode: '62701',
      country: 'US',
    });

    expect(result).toBe(false);
  });
});
