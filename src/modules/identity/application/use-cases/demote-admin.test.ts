import { describe, expect, it } from 'vitest';

import { DemoteAdmin } from './demote-admin';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';
import type { User, UserRole } from '@/modules/identity/domain/user';

function makeFakeUser(id: string, email: string, role: UserRole): User {
  return { id, email, role } as User;
}

function makeFakeUsers(user: User | null) {
  const roleUpdates: { userId: string; role: UserRole }[] = [];
  const repo: Partial<UserRepository> = {
    async findByEmail() {
      return user;
    },
    async updateRole(userId, role) {
      roleUpdates.push({ userId, role });
    },
  };
  return { repo: repo as UserRepository, roleUpdates };
}

describe('DemoteAdmin', () => {
  it('demotes an admin to customer', async () => {
    const user = makeFakeUser('user-1', 'admin@example.com', 'admin');
    const { repo, roleUpdates } = makeFakeUsers(user);

    const result = await new DemoteAdmin(repo).execute({
      email: 'admin@example.com',
      actingUserId: 'user-2',
    });

    expect(result.ok).toBe(true);
    expect(roleUpdates).toEqual([{ userId: 'user-1', role: 'customer' }]);
  });

  it('returns user_not_found for a nonexistent email', async () => {
    const { repo, roleUpdates } = makeFakeUsers(null);

    const result = await new DemoteAdmin(repo).execute({
      email: 'missing@example.com',
      actingUserId: 'user-2',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('user_not_found');
    expect(roleUpdates).toEqual([]);
  });

  it('refuses to demote yourself', async () => {
    const user = makeFakeUser('user-1', 'admin@example.com', 'admin');
    const { repo, roleUpdates } = makeFakeUsers(user);

    const result = await new DemoteAdmin(repo).execute({
      email: 'admin@example.com',
      actingUserId: 'user-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cannot_demote_self');
    expect(roleUpdates).toEqual([]);
  });
});
