import { randomBytes, randomUUID, createHash } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { PasswordResetRepository } from '@/modules/identity/application/ports/password-reset-repository';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import { renderResetPasswordEmail } from '@/modules/identity/application/reset-password-email-template';

export interface RequestPasswordResetInput {
  email: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Deliberately returns `void`, not a `Result` — there is no error branch
 * exposed to the caller. The whole point is that the response is identical
 * whether or not the email belongs to a real account (the standard
 * mitigation for account enumeration via password reset), so this use case
 * either does nothing silently or does the whole flow; a caller can't tell
 * which happened, by design.
 */
export class RequestPasswordReset implements UseCase<RequestPasswordResetInput, void> {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordResets: PasswordResetRepository,
    private readonly emailSender: EmailSender,
    private readonly appUrl: string,
    private readonly ttlSeconds: number,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    const user = await this.users.findByEmail(input.email);
    if (!user) return;

    await this.passwordResets.invalidateAllForUser(user.id);

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    await this.passwordResets.create({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    const resetUrl = `${this.appUrl}/reset-password/${rawToken}`;
    const { html, text } = await renderResetPasswordEmail({
      resetUrl,
      expiresInMinutes: Math.round(this.ttlSeconds / 60),
    });
    await this.emailSender.send({
      to: user.email,
      subject: 'Reset your password',
      html,
      text,
    });
  }
}
