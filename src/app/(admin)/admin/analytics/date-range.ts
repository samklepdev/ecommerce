const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
