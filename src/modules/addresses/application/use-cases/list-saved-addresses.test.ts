import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { ListSavedAddresses } from './list-saved-addresses';
import { SavedAddress } from '@/modules/addresses/domain/saved-address';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

function makeAddress(userId: string) {
  return SavedAddress.create({
    id: randomUUID(),
    userId,
    name: 'Ada Lovelace',
    line1: '1 Test St',
    city: 'Testville',
    region: 'TS',
    postalCode: '00000',
    country: 'US',
  });
}

describe('ListSavedAddresses', () => {
  it('delegates to the repository', async () => {
    const addresses = [makeAddress('user-1')];
    const calls: string[] = [];
    const repo: Partial<SavedAddressRepository> = {
      async listForUser(userId) {
        calls.push(userId);
        return addresses;
      },
    };

    const result = await new ListSavedAddresses(repo as SavedAddressRepository).execute({ userId: 'user-1' });

    expect(result).toBe(addresses);
    expect(calls).toEqual(['user-1']);
  });
});
