import { describe, expect, it } from 'vitest';

import { percentChange, withPreviousValue } from './chart-tooltip-math';

describe('percentChange', () => {
  it('returns null when there is no previous point', () => {
    expect(percentChange(100, null)).toBeNull();
  });

  it('returns null when the previous value is zero (undefined ratio)', () => {
    expect(percentChange(100, 0)).toBeNull();
  });

  it('computes a positive percent change, rounded to the nearest integer', () => {
    expect(percentChange(118, 100)).toBe(18);
  });

  it('computes a negative percent change', () => {
    expect(percentChange(80, 100)).toBe(-20);
  });

  it('returns 0 for no change', () => {
    expect(percentChange(100, 100)).toBe(0);
  });
});

describe('withPreviousValue', () => {
  it('attaches null as the previous value for the first point', () => {
    const result = withPreviousValue([{ label: '2026-01-01', value: 5 }]);
    expect(result).toEqual([{ label: '2026-01-01', value: 5, previousValue: null }]);
  });

  it('attaches the prior point\'s value for every subsequent point', () => {
    const result = withPreviousValue([
      { label: '2026-01-01', value: 5 },
      { label: '2026-01-02', value: 8 },
      { label: '2026-01-03', value: 3 },
    ]);
    expect(result).toEqual([
      { label: '2026-01-01', value: 5, previousValue: null },
      { label: '2026-01-02', value: 8, previousValue: 5 },
      { label: '2026-01-03', value: 3, previousValue: 8 },
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(withPreviousValue([])).toEqual([]);
  });
});
