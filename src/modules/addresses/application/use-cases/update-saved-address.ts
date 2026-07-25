import type { UseCase } from '@/shared/application/use-case';
import type { SavedAddressFields, SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

export interface UpdateSavedAddressInput extends SavedAddressFields {
  id: string;
  userId: string;
}

/** Returns false if the address doesn't exist or doesn't belong to this
 * user — same shape as `DeleteSavedAddress`/`SetDefaultSavedAddress`. */
export class UpdateSavedAddress implements UseCase<UpdateSavedAddressInput, boolean> {
  constructor(private readonly addresses: SavedAddressRepository) {}

  async execute(input: UpdateSavedAddressInput): Promise<boolean> {
    const { id, userId, ...details } = input;
    return this.addresses.update(id, userId, details);
  }
}
