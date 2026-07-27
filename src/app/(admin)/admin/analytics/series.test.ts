import { describe, expect, it } from 'vitest';

import { alignToDays, eachDayKey } from './series';

describe('eachDayKey', () => {
  it('lists every UTC day in the range, inclusive of both ends', () => {
    const keys = eachDayKey(new Date('2026-03-01T00:00:00Z'), new Date('2026-03-04T23:59:59Z'));

    expect(keys).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']);
  });

  it('returns the single day when the range is inside one day', () => {
    expect(eachDayKey(new Date('2026-03-01T04:00:00Z'), new Date('2026-03-01T18:00:00Z'))).toEqual([
      '2026-03-01',
    ]);
  });

  it('crosses month and year boundaries', () => {
    expect(eachDayKey(new Date('2025-12-30T00:00:00Z'), new Date('2026-01-02T00:00:00Z'))).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('returns nothing when the range is inverted', () => {
    expect(eachDayKey(new Date('2026-03-05T00:00:00Z'), new Date('2026-03-01T00:00:00Z'))).toEqual([]);
  });
});

describe('alignToDays', () => {
  const days = ['2026-03-01', '2026-03-02', '2026-03-03'];

  it('fills days the repository returned no row for with zero', () => {
    const rows = [{ day: '2026-03-01', count: 5 }, { day: '2026-03-03', count: 9 }];

    expect(alignToDays(days, rows, (r) => r.day, (r) => r.count)).toEqual([5, 0, 9]);
  });

  it('produces one value per day regardless of row order', () => {
    const rows = [{ day: '2026-03-03', count: 9 }, { day: '2026-03-01', count: 5 }];

    expect(alignToDays(days, rows, (r) => r.day, (r) => r.count)).toEqual([5, 0, 9]);
  });

  it('is all zeroes when there are no rows at all', () => {
    expect(alignToDays(days, [], (r: { day: string }) => r.day, () => 1)).toEqual([0, 0, 0]);
  });

  it('ignores rows outside the day list', () => {
    const rows = [{ day: '2026-02-28', count: 4 }, { day: '2026-03-02', count: 7 }];

    expect(alignToDays(days, rows, (r) => r.day, (r) => r.count)).toEqual([0, 7, 0]);
  });

  it('keeps two different series index-aligned so a hover reads one day', () => {
    // The whole reason this exists: revenue and sats come from separate
    // queries that each skip their own empty days.
    const revenue = [{ day: '2026-03-01', totalMinor: 1000 }];
    const sats = [{ day: '2026-03-03', sats: 42 }];

    const r = alignToDays(days, revenue, (x) => x.day, (x) => x.totalMinor);
    const s = alignToDays(days, sats, (x) => x.day, (x) => x.sats);

    expect(r).toEqual([1000, 0, 0]);
    expect(s).toEqual([0, 0, 42]);
    expect(r).toHaveLength(s.length);
  });
});
