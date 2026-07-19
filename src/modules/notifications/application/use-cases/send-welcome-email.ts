import { randomUUID } from 'node:crypto';

import type { UseCase } from '@/shared/application/use-case';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import type { WelcomeEmailRepository } from '@/modules/notifications/application/ports/welcome-email-repository';
import { renderWelcomeEmailHtml } from '@/modules/notifications/application/welcome-email-template';

export interface SendWelcomeEmailInput {
  userId: string;
  email: string;
}

/** Idempotent: a user only ever gets one welcome email (backstopped by the
 * unique index on `welcome_emails.user_id`). Called right after signup —
 * failures here must never block account creation. */
export class SendWelcomeEmail implements UseCase<SendWelcomeEmailInput, void> {
  constructor(
    private readonly welcomeEmails: WelcomeEmailRepository,
    private readonly emailSender: EmailSender,
    private readonly appUrl: string,
  ) {}

  async execute(input: SendWelcomeEmailInput): Promise<void> {
    const existing = await this.welcomeEmails.findByUserId(input.userId);
    if (existing) return;

    const trackingToken = randomUUID();
    const trackingUrl = `${this.appUrl}/api/email/track/${trackingToken}`;
    const html = renderWelcomeEmailHtml({ email: input.email, trackingUrl });

    await this.emailSender.send(input.email, 'Welcome!', html);
    await this.welcomeEmails.create({ id: randomUUID(), userId: input.userId, trackingToken });
  }
}
