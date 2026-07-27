export type DeltaDirection = 'up' | 'down' | 'flat';

export interface Delta {
  direction: DeltaDirection;
  /** Magnitude of the change, always non-negative — `direction` carries the
   * sign so the tile can pair it with an arrow instead of a "-". */
  percent: number;
}

/**
 * Change from `previous` to `current` as a percentage of `previous`.
 *
 * Returns `null` when `previous` is 0 and `current` isn't: there's no
 * baseline to divide by, and rendering "+100%" or "+∞%" for "went from
 * nothing to something" would overstate what the data supports. Callers
 * show no delta in that case.
 */
export function percentChange(current: number, previous: number): Delta | null {
  if (previous === 0) {
    return current === 0 ? { direction: 'flat', percent: 0 } : null;
  }

  const change = ((current - previous) / previous) * 100;
  const percent = Math.round(Math.abs(change) * 10) / 10;

  if (percent === 0) return { direction: 'flat', percent: 0 };
  return { direction: change > 0 ? 'up' : 'down', percent };
}
