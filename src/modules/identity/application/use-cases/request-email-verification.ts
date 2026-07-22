import { randomBytes, randomUUID, createHash } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import type { EmailVerificationRepository } from '@/modules/identity/application/ports/email-verification-repository';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import { renderVerifyEmailHtml } from '@/modules/identity/application/verify-email-template';

export interface RequestEmailVerificationInput {
  userId: string;
  email: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Mirrors `RequestPasswordReset`'s exact shape. Takes `{userId, email}`
 * directly rather than looking up by email — callers (signup, resend,
 * change-email) always already have the user in hand, so no
 * anti-enumeration concern applies here. */
export class RequestEmailVerification implements UseCase<RequestEmailVerificationInput, void> {
  constructor(
    private readonly emailVerifications: EmailVerificationRepository,
    private readonly emailSender: EmailSender,
    private readonly appUrl: string,
    private readonly ttlSeconds: number,
  ) {}

  async execute(input: RequestEmailVerificationInput): Promise<void> {
    await this.emailVerifications.invalidateAllForUser(input.userId);

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    await this.emailVerifications.create({
      id: randomUUID(),
      userId: input.userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });

    const verifyUrl = `${this.appUrl}/verify-email/${rawToken}`;
    const html = renderVerifyEmailHtml({
      verifyUrl,
      expiresInMinutes: Math.round(this.ttlSeconds / 60),
    });
    await this.emailSender.send(input.email, 'Verify your email', html);
  }
}
