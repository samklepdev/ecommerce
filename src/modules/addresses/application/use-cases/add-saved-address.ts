import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { SavedAddress } from '@/modules/addresses/domain/saved-address';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

export interface AddSavedAddressInput {
  userId: string;
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export class AddSavedAddress implements UseCase<AddSavedAddressInput, SavedAddress> {
  constructor(private readonly addresses: SavedAddressRepository) {}

  async execute(input: AddSavedAddressInput): Promise<SavedAddress> {
    const address = SavedAddress.create({ id: randomUUID(), ...input });
    await this.addresses.create(address);
    return address;
  }
}
