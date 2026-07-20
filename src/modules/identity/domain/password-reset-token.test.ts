import { describe, expect, it } from 'vitest';
import { PasswordResetToken } from './password-reset-token';

describe('PasswordResetToken#isUsed', () => {
  it('is false when usedAt is not set', () => {
    const token = PasswordResetToken.create({
      id: '1',
      userId: 'u1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(token.isUsed).toBe(false);
  });

  it('is true once usedAt is set', () => {
    const token = PasswordResetToken.create({
      id: '1',
      userId: 'u1',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });
    expect(token.isUsed).toBe(true);
  });
});
