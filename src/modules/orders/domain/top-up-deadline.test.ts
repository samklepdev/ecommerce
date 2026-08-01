import { describe, expect, it } from 'vitest';

import { formatTopUpDeadline, topUpDeadlineAt } from './top-up-deadline';

describe('topUpDeadlineAt', () => {
  it('adds the window to when money was first seen', () => {
    const seen = new Date('2026-08-01T10:00:00.000Z');
    expect(topUpDeadlineAt(seen, 48)).toEqual(new Date('2026-08-03T10:00:00.000Z'));
  });

  it('is null when the clock was never stamped', () => {
    // An order that has never had money seen against it has no top-up window,
    // and inventing one would put a date in front of a customer that nothing
    // enforces.
    expect(topUpDeadlineAt(null, 48)).toBeNull();
  });
});

describe('formatTopUpDeadline', () => {
  it('renders in UTC, labelled', () => {
    // Both surfaces that show this render server-side, in a timezone the
    // customer doesn't share. An unlabelled local time would be read as theirs.
    const seen = new Date('2026-08-01T10:30:00.000Z');
    expect(formatTopUpDeadline(seen, 48)).toBe('2026-08-03 10:30 UTC');
  });

  it('drops seconds rather than implying precision it does not have', () => {
    const seen = new Date('2026-08-01T10:30:45.000Z');
    expect(formatTopUpDeadline(seen, 12)).toBe('2026-08-01 22:30 UTC');
  });

  it('is null when the clock was never stamped', () => {
    expect(formatTopUpDeadline(null, 48)).toBeNull();
  });
});
