import type { UseCase } from '@/shared/application/use-case';
import type { WelcomeEmailRepository } from '@/modules/notifications/application/ports/welcome-email-repository';

export interface MarkWelcomeEmailOpenedInput {
  trackingToken: string;
}

export class MarkWelcomeEmailOpened implements UseCase<MarkWelcomeEmailOpenedInput, void> {
  constructor(private readonly welcomeEmails: WelcomeEmailRepository) {}

  async execute(input: MarkWelcomeEmailOpenedInput): Promise<void> {
    await this.welcomeEmails.markOpened(input.trackingToken);
  }
}
