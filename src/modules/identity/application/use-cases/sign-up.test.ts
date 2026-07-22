import { describe, expect, it } from 'vitest';

import { SignUp } from './sign-up';
import { User } from '@/modules/identity/domain/user';
import type { UserRepository } from '@/modules/identity/application/ports/user-repository';

function makeFakeUsers(existing: User | null) {
  const created: User[] = [];
  const repo: UserRepository = {
    async findByEmail() {
      return existing;
    },
    async findById() {
      return null;
    },
    async create(user) {
      created.push(user);
    },
    async updatePasswordHash() {},
    async updateAvatarUrl() {},
    async updateRole() {},
    async findProfileById() {
      return null;
    },
    async updateEmail() {},
    async markEmailVerified() {},
    async delete() {},
  };
  return { repo, created };
}

describe('SignUp', () => {
  it('creates a new user with a hashed password', async () => {
    const { repo, created } = makeFakeUsers(null);

    const result = await new SignUp(repo).execute({ email: 'new@example.com', password: 'plaintext123' });

    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]?.email).toBe('new@example.com');
    expect(created[0]?.passwordHash).not.toBe('plaintext123'); // must be hashed
  });

  it('returns email_taken when the email is already registered', async () => {
    const existing = User.create({ id: 'user-1', email: 'taken@example.com', passwordHash: 'hash' });
    const { repo, created } = makeFakeUsers(existing);

    const result = await new SignUp(repo).execute({ email: 'taken@example.com', password: 'plaintext123' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('email_taken');
    expect(created).toHaveLength(0);
  });
});
