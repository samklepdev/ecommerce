export interface ChartPoint {
  label: string;
  value: number;
  previousValue: number | null;
}

/** % change of `current` vs `previous`, rounded to the nearest integer
 * percent. `null` when there's no previous point to compare against, or
 * `previous` is zero (undefined ratio). */
export function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Attaches each point's predecessor value in the same series — the first
 * point has no predecessor, so its `previousValue` is `null`. */
export function withPreviousValue(points: { label: string; value: number }[]): ChartPoint[] {
  return points.map((p, i) => ({
    ...p,
    previousValue: i === 0 ? null : (points[i - 1]?.value ?? null),
  }));
}
