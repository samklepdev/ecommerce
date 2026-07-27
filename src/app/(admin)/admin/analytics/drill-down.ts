import type { DateRange } from './date-range';

/** Search params every drill-down accepts: the shared range plus paging. */
export interface DrillDownSearchParams {
  from?: string;
  to?: string;
  page?: string;
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Link back to the same page with a different page number, carrying the
 * current range so paging never silently resets it. */
export function pageHref(basePath: string, { since, until }: DateRange, page: number): string {
  const params = new URLSearchParams({ from: toDateParam(since), to: toDateParam(until) });
  if (page > 1) params.set('page', String(page));
  return `${basePath}?${params.toString()}`;
}

/** The CSV endpoint for exactly the window on screen. */
export function exportHref(route: string, { since, until }: DateRange): string {
  const params = new URLSearchParams({ from: toDateParam(since), to: toDateParam(until) });
  return `/api/admin/analytics/${route}/export?${params.toString()}`;
}
