import { describe, expect, it } from 'vitest';

import { PromoteUserToAdmin } from './promote-user-to-admin';
import { User } from '@/modules/identity/domain/user';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

function makeFakeUsers(existing?: User) {
  const roleByUserId = new Map<string, string>();
  if (existing) roleByUserId.set(existing.id, existing.role);

  const users: UserRepository = {
    async findByEmail(email) {
      if (!existing || existing.email !== email.toLowerCase()) return null;
      const role = roleByUserId.get(existing.id) ?? existing.role;
      return User.create({
        id: existing.id,
        email: existing.email,
        passwordHash: existing.passwordHash,
        role: role as 'customer' | 'admin',
      });
    },
    async findById() {
      return null;
    },
    async create() {},
    async updatePasswordHash() {},
    async updateAvatarUrl() {},
    async updateRole(userId, role) {
      roleByUserId.set(userId, role);
    },
    async findProfileById() {
      return null;
    },
  };
  return { users, roleByUserId };
}

describe('PromoteUserToAdmin', () => {
  it('promotes an existing customer to admin', async () => {
    const customer = User.create({ id: 'user-1', email: 'customer@example.com', passwordHash: 'hash' });
    const { users, roleByUserId } = makeFakeUsers(customer);

    const useCase = new PromoteUserToAdmin(users);
    const result = await useCase.execute({ email: 'customer@example.com' });

    expect(result.ok).toBe(true);
    expect(roleByUserId.get('user-1')).toBe('admin');
  });

  it('returns user_not_found for an unknown email', async () => {
    const { users } = makeFakeUsers(undefined);

    const useCase = new PromoteUserToAdmin(users);
    const result = await useCase.execute({ email: 'nobody@example.com' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('user_not_found');
  });

  it('is an idempotent no-op (still ok) when re-promoting an already-admin user', async () => {
    const admin = User.create({
      id: 'user-2',
      email: 'admin@example.com',
      passwordHash: 'hash',
      role: 'admin',
    });
    const { users, roleByUserId } = makeFakeUsers(admin);

    const useCase = new PromoteUserToAdmin(users);
    const result = await useCase.execute({ email: 'admin@example.com' });

    expect(result.ok).toBe(true);
    expect(roleByUserId.get('user-2')).toBe('admin');
  });
});
