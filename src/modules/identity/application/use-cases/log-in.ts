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
  /** Idle window for a customer session. */
  idleTimeoutSeconds: number;
  /** Idle window for an admin session — shorter, and chosen here because
   * this is the only place that knows the role at the moment a session is
   * minted. Authorization still reads the role from the database on every
   * request; this only governs how long the session may sit unused. */
  adminIdleTimeoutSeconds: number;
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

    const session = await this.sessions.create(user.id, {
      ttlSeconds: input.sessionTtlSeconds,
      idleTimeoutSeconds: user.isAdmin
        ? input.adminIdleTimeoutSeconds
        : input.idleTimeoutSeconds,
    });
    return ok(session);
  }
}
