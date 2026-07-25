import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseDateRange } from './date-range';

describe('parseDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to the last 30 days when no params are given', () => {
    const { since, until } = parseDateRange({});

    expect(until).toEqual(new Date('2026-07-25T12:00:00Z'));
    expect(since).toEqual(new Date('2026-06-25T12:00:00Z'));
  });

  it('defaults to a custom window when defaultDays is given', () => {
    const { since, until } = parseDateRange({}, 7);

    expect(until).toEqual(new Date('2026-07-25T12:00:00Z'));
    expect(since).toEqual(new Date('2026-07-18T12:00:00Z'));
  });

  it('uses explicit from/to, treating to as inclusive of that whole day', () => {
    const { since, until } = parseDateRange({ from: '2026-01-01', to: '2026-01-10' });

    expect(since).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(until).toEqual(new Date('2026-01-10T23:59:59.999Z'));
  });

  it('falls back to the default when a param is not a valid date', () => {
    const { since, until } = parseDateRange({ from: 'not-a-date', to: '2026-01-10' });

    expect(since).toEqual(new Date('2026-06-25T12:00:00Z'));
    expect(until).toEqual(new Date('2026-01-10T23:59:59.999Z'));
  });

  it('swaps an inverted range instead of erroring', () => {
    const { since, until } = parseDateRange({ from: '2026-01-10', to: '2026-01-01' });

    expect(since.getTime()).toBeLessThanOrEqual(until.getTime());
  });
});
