import { describe, expect, it } from 'vitest';

import { AddSavedAddress } from './add-saved-address';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';
import { SavedAddress } from '@/modules/addresses/domain/saved-address';

function makeFakeRepo() {
  const created: SavedAddress[] = [];
  const repo: Partial<SavedAddressRepository> = {
    async create(address) {
      created.push(address);
    },
  };
  return { repo: repo as SavedAddressRepository, created };
}

function validInput(userId = 'user-1') {
  return {
    userId,
    name: 'Ada Lovelace',
    line1: '1 Test St',
    city: 'Testville',
    region: 'TS',
    postalCode: '00000',
    country: 'US',
  };
}

describe('AddSavedAddress', () => {
  it('creates and persists a new saved address', async () => {
    const { repo, created } = makeFakeRepo();

    const address = await new AddSavedAddress(repo).execute(validInput());

    expect(created).toEqual([address]);
    expect(address.userId).toBe('user-1');
    expect(address.name).toBe('Ada Lovelace');
  });

  it('throws on invalid input (delegates validation to the domain entity)', async () => {
    const { repo } = makeFakeRepo();

    await expect(
      new AddSavedAddress(repo).execute({ ...validInput(), name: '' }),
    ).rejects.toThrow();
  });
});
