import { describe, expect, it } from 'vitest';

import { FindUserByEmailForAdmin } from './find-user-by-email-for-admin';
import { User } from '@/modules/identity/domain/user';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

function makeFakeUsers(user: User | null) {
  const repo: Partial<UserRepository> = {
    async findByEmail() {
      return user;
    },
  };
  return repo as UserRepository;
}

describe('FindUserByEmailForAdmin', () => {
  it('returns a safe profile projection, never the password hash', async () => {
    const user = User.create({ id: 'user-1', email: 'buyer@example.com', passwordHash: 'super-secret-hash' });
    const repo = makeFakeUsers(user);

    const result = await new FindUserByEmailForAdmin(repo).execute({ email: 'buyer@example.com' });

    expect(result).toEqual({
      id: 'user-1',
      email: 'buyer@example.com',
      role: 'customer',
      avatarUrl: null,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns null when no user matches the email', async () => {
    const repo = makeFakeUsers(null);

    const result = await new FindUserByEmailForAdmin(repo).execute({ email: 'missing@example.com' });

    expect(result).toBeNull();
  });
});
