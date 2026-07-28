/** One page of a list, requested by 1-indexed page number. */
export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  /** The page actually served — clamped into range, so a garbage or
   * out-of-bounds `?page=` yields the last real page rather than nothing. */
  page: number;
  totalPages: number;
  totalItems: number;
}

/**
 * Resolves a page against a total, then fetches only that page.
 *
 * The clamp is why the count comes first: with a raw LIMIT/OFFSET, `?page=900`
 * on a 3-page list returns an empty table and a pager that says "page 900 of
 * 3". The in-memory `paginate()` this replaces clamped for free because it
 * already held every row — which was the problem.
 *
 * Two sequential round trips per list page (count, then select) instead of
 * one query that drags the whole table into the process. That trade is the
 * point: the cost of the second query is constant, and the cost of the thing
 * it replaces grows with the table.
 */
export async function fetchPage<T>(
  request: PageRequest,
  count: () => Promise<number>,
  fetch: (limit: number, offset: number) => Promise<T[]>,
): Promise<PageResult<T>> {
  const pageSize = Math.max(1, request.pageSize);
  const totalItems = await count();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, request.page), totalPages);

  // Nothing to select, and skipping the query keeps an empty list at one
  // round trip rather than two.
  if (totalItems === 0) return { items: [], page: 1, totalPages: 1, totalItems: 0 };

  const items = await fetch(pageSize, (page - 1) * pageSize);
  return { items, page, totalPages, totalItems };
}
