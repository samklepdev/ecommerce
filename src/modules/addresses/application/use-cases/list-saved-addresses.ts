import type { UseCase } from '@/shared/application/use-case';
import type { SavedAddress } from '@/modules/addresses/domain/saved-address';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

export interface ListSavedAddressesInput {
  userId: string;
}

export class ListSavedAddresses implements UseCase<ListSavedAddressesInput, SavedAddress[]> {
  constructor(private readonly addresses: SavedAddressRepository) {}

  async execute(input: ListSavedAddressesInput): Promise<SavedAddress[]> {
    return this.addresses.listForUser(input.userId);
  }
}
