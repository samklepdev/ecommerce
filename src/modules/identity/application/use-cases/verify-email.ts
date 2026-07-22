import { createHash } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { EmailVerificationRepository } from '@/modules/identity/application/ports/email-verification-repository';

export interface VerifyEmailInput {
  token: string;
}

export type VerifyEmailError = { code: 'invalid_or_expired_token' };

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Mirrors `ResetPassword`'s exact shape. */
export class VerifyEmail implements UseCase<VerifyEmailInput, Result<void, VerifyEmailError>> {
  constructor(
    private readonly users: UserRepository,
    private readonly emailVerifications: EmailVerificationRepository,
  ) {}

  async execute(input: VerifyEmailInput): Promise<Result<void, VerifyEmailError>> {
    const tokenHash = hashToken(input.token);
    const record = await this.emailVerifications.findValidByToken(tokenHash, new Date());
    if (!record) return err({ code: 'invalid_or_expired_token' });

    await this.users.markEmailVerified(record.userId, new Date());
    await this.emailVerifications.markUsed(record.id);

    return ok(undefined);
  }
}
