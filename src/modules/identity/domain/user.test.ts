import { describe, expect, it } from 'vitest';
import { User } from './user';

describe('User.create', () => {
  it('lowercases the email', () => {
    const user = User.create({ id: '1', email: 'Person@Example.COM', passwordHash: 'hash' });
    expect(user.email).toBe('person@example.com');
  });

  it('throws on an email with no @', () => {
    expect(() => User.create({ id: '1', email: 'not-an-email', passwordHash: 'hash' })).toThrow(
      'Invalid email',
    );
  });

  it('defaults role to customer and avatarUrl to null', () => {
    const user = User.create({ id: '1', email: 'a@example.com', passwordHash: 'hash' });
    expect(user.role).toBe('customer');
    expect(user.avatarUrl).toBeNull();
    expect(user.isAdmin).toBe(false);
  });

  it('honors an explicit admin role', () => {
    const user = User.create({ id: '1', email: 'a@example.com', passwordHash: 'hash', role: 'admin' });
    expect(user.isAdmin).toBe(true);
  });
});
