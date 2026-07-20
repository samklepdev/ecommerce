import { describe, expect, it } from 'vitest';
import { Session } from './session';

describe('Session#isExpired', () => {
  it('is false when expiresAt is in the future', () => {
    const session = Session.create({ id: '1', userId: 'u1', expiresAt: new Date(Date.now() + 60_000) });
    expect(session.isExpired).toBe(false);
  });

  it('is true when expiresAt is in the past', () => {
    const session = Session.create({ id: '1', userId: 'u1', expiresAt: new Date(Date.now() - 60_000) });
    expect(session.isExpired).toBe(true);
  });

  it('is true at the exact expiry boundary', () => {
    const now = new Date();
    const session = Session.create({ id: '1', userId: 'u1', expiresAt: now });
    expect(session.isExpired).toBe(true);
  });
});
