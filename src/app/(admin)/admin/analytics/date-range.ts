export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateRange {
  since: Date;
  until: Date;
}

export interface DateRangeSearchParams {
  from?: string;
  to?: string;
}

function parseDateParam(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalizes `from`/`to` search params (as produced by an
 * `<input type="date">`) into a date range. Missing or unparseable params
 * default to the last `defaultDays` days ending now. `to` is a calendar
 * date, not an instant — it's treated as inclusive of that whole day, not
 * just its midnight instant, so selecting "today" as the end date includes
 * today's events. An inverted range (`from` after `to`) is swapped rather
 * than rejected.
 */
export function parseDateRange(
  searchParams: DateRangeSearchParams,
  defaultDays = 30,
): DateRange {
  const now = new Date();

  let from = parseDateParam(searchParams.from);
  let to = parseDateParam(searchParams.to);

  // Swap the raw dates (before the inclusive-day expansion below) so an
  // inverted explicit range doesn't get half-swapped with mismatched
  // start/end-of-day boundaries.
  if (from !== null && to !== null && from.getTime() > to.getTime()) {
    [from, to] = [to, from];
  }

  const until = to ? new Date(to.getTime() + MS_PER_DAY - 1) : now;
  // A missing/invalid `from` defaults relative to `until`, not to `now` —
  // otherwise a valid `to` far in the past pairs with a recent default
  // `since` and silently produces an inverted, always-empty range.
  const since = from ?? new Date(until.getTime() - defaultDays * MS_PER_DAY);

  return { since, until };
}

/** The preset windows offered by the segmented control, in days. */
export const RANGE_PRESETS = [7, 30, 90] as const;

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A link to `basePath` showing the last `days` days.
 *
 * Presets resolve to concrete `from`/`to` params rather than a `?range=`
 * shorthand so every existing consumer of this contract — the drill-down
 * pages, the CSV export routes, a bookmarked URL — keeps working unchanged.
 */
export function presetHref(basePath: string, days: number, now = new Date()): string {
  const from = new Date(now.getTime() - days * MS_PER_DAY);
  return `${basePath}?from=${toDateParam(from)}&to=${toDateParam(now)}`;
}

/**
 * Which preset the current range corresponds to, or `null` for a custom one.
 *
 * A window is only a preset if it's also anchored to today — a 30-day window
 * from last spring is a custom range, and lighting up "30d" would misreport
 * what's on screen.
 */
export function activePreset(since: Date, until: Date, now = new Date()): number | null {
  if (toDateParam(until) !== toDateParam(now)) return null;

  // Compared as calendar dates, not as a millisecond span: `parseDateRange`
  // pushes `until` to the end of its day, so a 7-day preset covers 8
  // calendar days and an arithmetic span would never match.
  const sinceDate = toDateParam(since);
  return (
    RANGE_PRESETS.find(
      (preset) => toDateParam(new Date(now.getTime() - preset * MS_PER_DAY)) === sinceDate,
    ) ?? null
  );
}

/**
 * The equally-long window immediately preceding `range`, for
 * period-over-period comparison on the KPI tiles.
 *
 * Ends 1ms before `range.since` so the two windows never share an event —
 * an overlap would double-count a boundary day and make a flat metric look
 * like it grew.
 */
export function previousWindow({ since, until }: DateRange): DateRange {
  const length = until.getTime() - since.getTime();
  const previousUntil = new Date(since.getTime() - 1);

  return { since: new Date(previousUntil.getTime() - length), until: previousUntil };
}
