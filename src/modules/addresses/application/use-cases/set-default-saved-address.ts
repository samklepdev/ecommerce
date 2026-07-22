import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

export interface SetDefaultSavedAddressInput {
  id: string;
  userId: string;
}

export type SetDefaultSavedAddressError = { code: 'not_found' };

export class SetDefaultSavedAddress
  implements UseCase<SetDefaultSavedAddressInput, Result<void, SetDefaultSavedAddressError>>
{
  constructor(private readonly addresses: SavedAddressRepository) {}

  async execute(input: SetDefaultSavedAddressInput): Promise<Result<void, SetDefaultSavedAddressError>> {
    const succeeded = await this.addresses.setDefault(input.id, input.userId);
    if (!succeeded) return err({ code: 'not_found' });
    return ok(undefined);
  }
}
