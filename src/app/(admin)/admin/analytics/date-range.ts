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
  const defaultSince = new Date(now.getTime() - defaultDays * MS_PER_DAY);

  const from = parseDateParam(searchParams.from);
  const to = parseDateParam(searchParams.to);

  const since = from ?? defaultSince;
  const until = to ? new Date(to.getTime() + MS_PER_DAY - 1) : now;

  // Only swap if both from and to were explicitly provided and parsed successfully
  const bothProvided = from !== null && to !== null;
  return bothProvided && since.getTime() > until.getTime() ? { since: until, until: since } : { since, until };
}
