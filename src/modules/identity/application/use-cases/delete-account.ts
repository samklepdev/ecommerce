import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { verifyPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface DeleteAccountInput {
  userId: string;
  currentPassword: string;
}

export type DeleteAccountError = { code: 'invalid_current_password' } | { code: 'user_not_found' };

/** Password confirmation is the friction/confirmation step for this
 * irreversible action — same bar as `ChangePassword`, no separate confirm
 * dialog. `orders.user_id` is `onDelete: 'set null'`, so the account's
 * orders survive, just disassociated. The caller (the action) is
 * responsible for destroying the now-dangling session afterward. */
export class DeleteAccount implements UseCase<DeleteAccountInput, Result<void, DeleteAccountError>> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: DeleteAccountInput): Promise<Result<void, DeleteAccountError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err({ code: 'user_not_found' });

    const valid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) return err({ code: 'invalid_current_password' });

    await this.users.delete(input.userId);
    return ok(undefined);
  }
}
