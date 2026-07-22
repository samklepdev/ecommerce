import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { verifyPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface ChangeEmailInput {
  userId: string;
  newEmail: string;
  currentPassword: string;
}

export type ChangeEmailError =
  | { code: 'invalid_current_password' }
  | { code: 'email_taken' }
  | { code: 'user_not_found' };

/** Mirrors `ChangePassword`'s shape. `UserRepository.updateEmail` also
 * resets `emailVerifiedAt` to null — changing the address always requires
 * re-verifying the new one; the caller (the action) is responsible for
 * triggering a fresh `RequestEmailVerification` afterward. */
export class ChangeEmail implements UseCase<ChangeEmailInput, Result<void, ChangeEmailError>> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: ChangeEmailInput): Promise<Result<void, ChangeEmailError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err({ code: 'user_not_found' });

    const valid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) return err({ code: 'invalid_current_password' });

    const existing = await this.users.findByEmail(input.newEmail);
    if (existing && existing.id !== input.userId) return err({ code: 'email_taken' });

    await this.users.updateEmail(input.userId, input.newEmail.toLowerCase());
    return ok(undefined);
  }
}
