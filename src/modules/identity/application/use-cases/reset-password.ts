import { createHash } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { hashPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { PasswordResetRepository } from '@/modules/identity/application/ports/password-reset-repository';

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export type ResetPasswordError = { code: 'invalid_or_expired_token' };

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Does not invalidate the user's other active sessions — same accepted
 * limitation as `ChangePassword` (`SessionStore` has no list-by-user
 * index). Worth noting the risk is a bit sharper here than for
 * `ChangePassword`: a forgot-password flow is often triggered because an
 * account is suspected compromised, so leaving old sessions alive after a
 * reset is a real, if accepted, gap. */
export class ResetPassword implements UseCase<ResetPasswordInput, Result<void, ResetPasswordError>> {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordResets: PasswordResetRepository,
  ) {}

  async execute(input: ResetPasswordInput): Promise<Result<void, ResetPasswordError>> {
    const tokenHash = hashToken(input.token);
    const record = await this.passwordResets.findValidByToken(tokenHash, new Date());
    if (!record) return err({ code: 'invalid_or_expired_token' });

    // Update the password before marking the token used: if marking used
    // fails after this, the worst case is a rare re-usable token — the
    // reverse order would silently burn the token while leaving the
    // password unchanged.
    const passwordHash = await hashPassword(input.newPassword);
    await this.users.updatePasswordHash(record.userId, passwordHash);
    await this.passwordResets.markUsed(record.id);

    return ok(undefined);
  }
}
