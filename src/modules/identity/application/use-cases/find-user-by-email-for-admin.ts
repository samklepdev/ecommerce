import type { UseCase } from '@/shared/application/use-case';
import type { UserRole } from '@/modules/identity/domain/user';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

export interface FindUserByEmailForAdminInput {
  email: string;
}

export interface AdminUserProfile {
  id: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
}

/** A safe projection for admin lookup — never exposes `passwordHash`. */
export class FindUserByEmailForAdmin
  implements UseCase<FindUserByEmailForAdminInput, AdminUserProfile | null>
{
  constructor(private readonly users: UserRepository) {}

  async execute(input: FindUserByEmailForAdminInput): Promise<AdminUserProfile | null> {
    const user = await this.users.findByEmail(input.email);
    if (!user) return null;

    return { id: user.id, email: user.email, role: user.role, avatarUrl: user.avatarUrl };
  }
}
