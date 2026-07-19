import type { UseCase } from '@/shared/application/use-case';
import type { WelcomeEmailRepository } from '@/modules/notifications/application/ports/welcome-email-repository';

export interface GetWelcomeEmailStatusInput {
  userId: string;
}

export interface WelcomeEmailStatusResult {
  sent: boolean;
  sentAt: Date | null;
  opened: boolean;
  openedAt: Date | null;
}

export class GetWelcomeEmailStatus implements UseCase<GetWelcomeEmailStatusInput, WelcomeEmailStatusResult> {
  constructor(private readonly welcomeEmails: WelcomeEmailRepository) {}

  async execute(input: GetWelcomeEmailStatusInput): Promise<WelcomeEmailStatusResult> {
    const status = await this.welcomeEmails.findByUserId(input.userId);
    if (!status) return { sent: false, sentAt: null, opened: false, openedAt: null };

    return {
      sent: true,
      sentAt: status.sentAt,
      opened: status.openedAt !== null,
      openedAt: status.openedAt,
    };
  }
}
