import { describe, expect, it } from 'vitest';
import { Session } from './session';

const AT = new Date('2026-07-30T12:00:00.000Z');
const minutes = (n: number) => n * 60_000;

function makeSession(overrides: Partial<Parameters<typeof Session.create>[0]> = {}) {
  return Session.create({
    id: 'session-1',
    userId: 'user-1',
    expiresAt: new Date(AT.getTime() + minutes(60)),
    lastSeenAt: AT,
    idleTimeoutSeconds: 15 * 60,
    reauthenticatedAt: AT,
    ...overrides,
  });
}

describe('Session — the absolute clock', () => {
  it('is not expired while expiresAt is ahead', () => {
    expect(makeSession().isExpiredAt(AT)).toBe(false);
  });

  it('is expired once expiresAt has passed', () => {
    expect(makeSession().isExpiredAt(new Date(AT.getTime() + minutes(61)))).toBe(true);
  });

  it('is expired exactly at the boundary, not a moment after', () => {
    expect(makeSession({ expiresAt: AT }).isExpiredAt(AT)).toBe(true);
  });
});

describe('Session — the idle clock', () => {
  it('is not idle while inside its window', () => {
    expect(makeSession().isIdleAt(new Date(AT.getTime() + minutes(14)))).toBe(false);
  });

  it('is idle once the window has passed since it was last seen', () => {
    expect(makeSession().isIdleAt(new Date(AT.getTime() + minutes(16)))).toBe(true);
  });

  // The window runs from last activity, not from login — otherwise it's just
  // a shorter absolute expiry, and a session in constant use would die.
  it('measures from lastSeenAt, so activity keeps it alive', () => {
    const active = makeSession({ lastSeenAt: new Date(AT.getTime() + minutes(50)) });

    expect(active.isIdleAt(new Date(AT.getTime() + minutes(55)))).toBe(false);
  });
});

describe('Session#isValidAt', () => {
  it('is valid while both clocks allow it', () => {
    expect(makeSession().isValidAt(AT)).toBe(true);
  });

  // An admin session that has sat untouched dies well before its ceiling.
  // That is the entire point of the second clock.
  it('is invalid when idle, even with the absolute clock far from running out', () => {
    const session = makeSession({ expiresAt: new Date(AT.getTime() + minutes(60 * 24 * 30)) });

    expect(session.isValidAt(new Date(AT.getTime() + minutes(20)))).toBe(false);
  });

  it('is invalid when the absolute clock runs out, however recently it was used', () => {
    const session = makeSession({ lastSeenAt: new Date(AT.getTime() + minutes(59)) });

    expect(session.isValidAt(new Date(AT.getTime() + minutes(61)))).toBe(false);
  });
});

describe('Session#hasRecentAuthAt', () => {
  it('is true inside the re-auth window', () => {
    expect(makeSession().hasRecentAuthAt(15 * 60, new Date(AT.getTime() + minutes(14)))).toBe(true);
  });

  it('is false once the window has passed', () => {
    expect(makeSession().hasRecentAuthAt(15 * 60, new Date(AT.getTime() + minutes(16)))).toBe(false);
  });

  // Browsing the console refreshes lastSeenAt but must not refresh this:
  // sudo mode is bought by typing the password, not by being present.
  it('is not extended by activity', () => {
    const active = makeSession({ lastSeenAt: new Date(AT.getTime() + minutes(30)) });

    expect(active.hasRecentAuthAt(15 * 60, new Date(AT.getTime() + minutes(31)))).toBe(false);
  });
});

describe('Session#secondsUntilExpiry', () => {
  it('reports what is left on the absolute clock', () => {
    expect(makeSession().secondsUntilExpiry(AT)).toBe(3600);
  });

  it('never goes negative, so a TTL computed from it never is either', () => {
    expect(makeSession().secondsUntilExpiry(new Date(AT.getTime() + minutes(120)))).toBe(0);
  });
});
