import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { SavedAddressRepository } from '@/modules/addresses/application/ports/saved-address-repository';

export interface DeleteSavedAddressInput {
  id: string;
  userId: string;
}

export type DeleteSavedAddressError = { code: 'not_found' };

export class DeleteSavedAddress
  implements UseCase<DeleteSavedAddressInput, Result<void, DeleteSavedAddressError>>
{
  constructor(private readonly addresses: SavedAddressRepository) {}

  async execute(input: DeleteSavedAddressInput): Promise<Result<void, DeleteSavedAddressError>> {
    const deleted = await this.addresses.delete(input.id, input.userId);
    if (!deleted) return err({ code: 'not_found' });
    return ok(undefined);
  }
}
