import type { UseCase } from '@/shared/application/use-case';
import type { SessionStore } from '@/modules/identity/application/ports/session-store';

export interface LogOutInput {
  sessionId: string;
}

export class LogOut implements UseCase<LogOutInput, void> {
  constructor(private readonly sessions: SessionStore) {}

  async execute(input: LogOutInput): Promise<void> {
    await this.sessions.destroy(input.sessionId);
  }
}
