import type { UseCase } from '@/shared/application/use-case';
import { err, ok, type Result } from '@/shared/domain/result';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface DemoteAdminInput {
  email: string;
  /** The admin performing the demotion — enforced here, not just hidden in
   * the UI, so an admin can never revoke their own access and get locked
   * out of the admin panel. */
  actingUserId: string;
}

export type DemoteAdminError = { code: 'user_not_found' } | { code: 'cannot_demote_self' };

export class DemoteAdmin implements UseCase<DemoteAdminInput, Result<void, DemoteAdminError>> {
  constructor(private readonly users: UserRepository) {}

  async execute(input: DemoteAdminInput): Promise<Result<void, DemoteAdminError>> {
    const user = await this.users.findByEmail(input.email);
    if (!user) return err({ code: 'user_not_found' });
    if (user.id === input.actingUserId) return err({ code: 'cannot_demote_self' });

    await this.users.updateRole(user.id, 'customer');
    return ok(undefined);
  }
}
