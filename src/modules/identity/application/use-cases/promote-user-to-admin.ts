import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface PromoteUserToAdminInput {
  email: string;
}

export type PromoteUserToAdminError = { code: 'user_not_found' };

/** The account must already exist (sign up normally, then promote) — this
 * never creates a user. Idempotent: re-promoting an already-admin user is a
 * harmless no-op that still returns `ok`, matching how the ad hoc `UPDATE
 * users SET role = 'admin'` this replaces already behaved. */
export class PromoteUserToAdmin
  implements UseCase<PromoteUserToAdminInput, Result<void, PromoteUserToAdminError>>
{
  constructor(private readonly users: UserRepository) {}

  async execute(input: PromoteUserToAdminInput): Promise<Result<void, PromoteUserToAdminError>> {
    const user = await this.users.findByEmail(input.email);
    if (!user) return err({ code: 'user_not_found' });

    await this.users.updateRole(user.id, 'admin');
    return ok(undefined);
  }
}
