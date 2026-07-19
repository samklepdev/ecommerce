import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { hashPassword, verifyPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export type ChangePasswordError = { code: 'invalid_current_password' } | { code: 'user_not_found' };

/** Does not invalidate the user's other active sessions on the assumption
 * that this is out of scope for now — `SessionStore` has no list-by-user
 * index, and adding one is a bigger change than this feature warrants. */
export class ChangePassword implements UseCase<ChangePasswordInput, Result<void, ChangePasswordError>> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: ChangePasswordInput): Promise<Result<void, ChangePasswordError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err({ code: 'user_not_found' });

    const valid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) return err({ code: 'invalid_current_password' });

    const passwordHash = await hashPassword(input.newPassword);
    await this.users.updatePasswordHash(input.userId, passwordHash);
    return ok(undefined);
  }
}
