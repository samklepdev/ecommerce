import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { verifyPassword } from '@/shared/infrastructure/password-hash';
import type { Session } from '@/modules/identity/domain/session';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { SessionStore } from '@/modules/identity/application/ports/session-store';

export interface LogInInput {
  email: string;
  password: string;
  sessionTtlSeconds: number;
}

export type LogInError = { code: 'invalid_credentials' };

export class LogIn implements UseCase<LogInInput, Result<Session, LogInError>> {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
  ) {}

  async execute(input: LogInInput): Promise<Result<Session, LogInError>> {
    const user = await this.users.findByEmail(input.email);
    if (!user) return err({ code: 'invalid_credentials' });

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) return err({ code: 'invalid_credentials' });

    const session = await this.sessions.create(user.id, input.sessionTtlSeconds);
    return ok(session);
  }
}
