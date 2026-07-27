import { MS_PER_DAY } from './date-range';

/**
 * Every UTC day key (`YYYY-MM-DD`) in `[since, until]`, inclusive.
 *
 * The analytics repositories group by day and only return days that had
 * activity, so this is the spine a sparse series gets projected onto.
 */
export function eachDayKey(since: Date, until: Date): string[] {
  const first = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate());
  const last = Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), until.getUTCDate());

  const keys: string[] = [];
  for (let t = first; t <= last; t += MS_PER_DAY) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Projects a sparse day-keyed series onto `days`, filling absent days with 0.
 *
 * Charts that overlay two series (revenue against sats) index them in
 * lockstep — `revenue[i]` and `sats[i]` must be the same calendar day. They
 * come from separate queries that each skip their own empty days, so
 * without this a hover on day 12 could read revenue from one date and sats
 * from another.
 */
export function alignToDays<T>(
  days: string[],
  rows: readonly T[],
  key: (row: T) => string,
  value: (row: T) => number,
): number[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    byDay.set(key(row), value(row));
  }
  return days.map((day) => byDay.get(day) ?? 0);
}
