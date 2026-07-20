import { describe, expect, it } from 'vitest';
import { WelcomeEmail } from './welcome-email';

describe('WelcomeEmail#isOpened', () => {
  it('is false when openedAt is not set', () => {
    const email = WelcomeEmail.create({
      id: '1',
      userId: 'u1',
      trackingToken: 'tok',
      sentAt: new Date(),
    });
    expect(email.isOpened).toBe(false);
  });

  it('is true once openedAt is set', () => {
    const email = WelcomeEmail.create({
      id: '1',
      userId: 'u1',
      trackingToken: 'tok',
      sentAt: new Date(),
      openedAt: new Date(),
    });
    expect(email.isOpened).toBe(true);
  });
});
