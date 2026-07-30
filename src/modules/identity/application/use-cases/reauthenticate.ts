import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import { verifyPassword } from '@/shared/infrastructure/password-hash';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { SessionStore } from '@/modules/identity/application/ports/session-store';

export interface ReauthenticateInput {
  sessionId: string;
  password: string;
}

export type ReauthenticateError = { code: 'invalid_password' } | { code: 'no_session' };

/**
 * Re-confirms the password on an existing session — "sudo mode".
 *
 * Stamps the session rather than issuing a new one: the point is to prove
 * the person at the keyboard is still the account holder, not to start a new
 * login. Deliberately does *not* take an email — using the session's own
 * user is what stops this being a second, unthrottled login endpoint.
 */
export class Reauthenticate implements UseCase<ReauthenticateInput, Result<void, ReauthenticateError>> {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
  ) {}

  async execute(input: ReauthenticateInput): Promise<Result<void, ReauthenticateError>> {
    const session = await this.sessions.get(input.sessionId);
    if (!session) return err({ code: 'no_session' });

    const user = await this.users.findById(session.userId);
    if (!user) return err({ code: 'no_session' });

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) return err({ code: 'invalid_password' });

    await this.sessions.markReauthenticated(input.sessionId);
    return ok(undefined);
  }
}
