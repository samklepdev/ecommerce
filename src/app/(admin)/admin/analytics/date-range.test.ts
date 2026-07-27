import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activePreset, parseDateRange, presetHref, previousWindow } from './date-range';

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

  it('falls back to a window relative to `until` when `from` is not a valid date', () => {
    const { since, until } = parseDateRange({ from: 'not-a-date', to: '2026-01-10' });

    expect(until).toEqual(new Date('2026-01-10T23:59:59.999Z'));
    expect(since).toEqual(new Date('2025-12-11T23:59:59.999Z'));
    expect(since.getTime()).toBeLessThanOrEqual(until.getTime());
  });

  it('swaps an inverted range instead of erroring, preserving whole-day boundaries', () => {
    const { since, until } = parseDateRange({ from: '2026-01-10', to: '2026-01-01' });

    expect(since).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(until).toEqual(new Date('2026-01-10T23:59:59.999Z'));
  });
});

describe('previousWindow', () => {
  it('returns the equally-long window ending just before the given one', () => {
    const previous = previousWindow({
      since: new Date('2026-01-11T00:00:00.000Z'),
      until: new Date('2026-01-20T23:59:59.999Z'),
    });

    expect(previous.until).toEqual(new Date('2026-01-10T23:59:59.999Z'));
    expect(previous.since).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('never overlaps the window it is compared against', () => {
    const current = parseDateRange({ from: '2026-03-01', to: '2026-03-31' });
    const previous = previousWindow(current);

    expect(previous.until.getTime()).toBeLessThan(current.since.getTime());
  });

  it('preserves the length of the window so the two are comparable', () => {
    const current = parseDateRange({ from: '2026-05-01', to: '2026-05-07' });
    const previous = previousWindow(current);

    expect(previous.until.getTime() - previous.since.getTime()).toBe(
      current.until.getTime() - current.since.getTime(),
    );
  });
});

describe('presetHref', () => {
  const now = new Date('2026-07-25T12:00:00Z');

  it('links to the last N days as concrete from/to params', () => {
    expect(presetHref('/admin/analytics', 7, now)).toBe(
      '/admin/analytics?from=2026-07-18&to=2026-07-25',
    );
  });

  it('round-trips through parseDateRange back to the same preset', () => {
    const href = presetHref('/admin/analytics', 30, now);
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    const { since, until } = parseDateRange(params);

    expect(activePreset(since, until, now)).toBe(30);
  });
});

describe('activePreset', () => {
  const now = new Date('2026-07-25T12:00:00Z');

  it('identifies a window that matches a preset and ends today', () => {
    const { since, until } = parseDateRange({ from: '2026-07-18', to: '2026-07-25' });

    expect(activePreset(since, until, now)).toBe(7);
  });

  it('reports a non-preset span as custom', () => {
    const { since, until } = parseDateRange({ from: '2026-07-11', to: '2026-07-25' });

    expect(activePreset(since, until, now)).toBeNull();
  });

  it('reports a preset-length window in the past as custom', () => {
    // Same 7-day length, but it doesn't end today — highlighting "7d" would
    // claim the page is showing the last week when it isn't.
    const { since, until } = parseDateRange({ from: '2026-03-01', to: '2026-03-08' });

    expect(activePreset(since, until, now)).toBeNull();
  });
});
