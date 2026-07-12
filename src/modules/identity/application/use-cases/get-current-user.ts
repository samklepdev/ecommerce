import type { UseCase } from '@/shared/application/use-case';
import type { User } from '@/modules/identity/domain/user';
import type { SessionStore } from '@/modules/identity/application/ports/session-store';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface GetCurrentUserInput {
  sessionId: string | null;
}

export class GetCurrentUser implements UseCase<GetCurrentUserInput, User | null> {
  constructor(
    private readonly sessions: SessionStore,
    private readonly users: UserRepository,
  ) {}

  async execute(input: GetCurrentUserInput): Promise<User | null> {
    if (!input.sessionId) return null;
    const session = await this.sessions.get(input.sessionId);
    if (!session || session.isExpired) return null;
    return this.users.findById(session.userId);
  }
}
