import { describe, expect, it, vi } from 'vitest';

import { fetchPage } from './page';

function rows(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row-${i + 1}`);
}

describe('fetchPage', () => {
  it('asks for exactly one page, not the whole table', async () => {
    const fetch = vi.fn(async (limit: number, offset: number) =>
      rows(100).slice(offset, offset + limit),
    );

    const result = await fetchPage({ page: 3, pageSize: 10 }, async () => 100, fetch);

    expect(fetch).toHaveBeenCalledWith(10, 20);
    expect(result.items).toHaveLength(10);
    expect(result.items[0]).toBe('row-21');
    expect(result).toMatchObject({ page: 3, totalPages: 10, totalItems: 100 });
  });

  // The in-memory paginate() clamped for free because it already held every
  // row. With LIMIT/OFFSET an out-of-range page is an empty table and a pager
  // claiming "page 900 of 3", so the clamp has to be explicit.
  it('clamps a page past the end onto the last page', async () => {
    const fetch = vi.fn(async (limit: number, offset: number) =>
      rows(25).slice(offset, offset + limit),
    );

    const result = await fetchPage({ page: 900, pageSize: 10 }, async () => 25, fetch);

    expect(fetch).toHaveBeenCalledWith(10, 20);
    expect(result.page).toBe(3);
    expect(result.items).toEqual(['row-21', 'row-22', 'row-23', 'row-24', 'row-25']);
  });

  it('clamps a page below one', async () => {
    const fetch = vi.fn(async (limit: number, offset: number) =>
      rows(25).slice(offset, offset + limit),
    );

    const result = await fetchPage({ page: -4, pageSize: 10 }, async () => 25, fetch);

    expect(fetch).toHaveBeenCalledWith(10, 0);
    expect(result.page).toBe(1);
  });

  it('skips the select entirely when there is nothing to list', async () => {
    const fetch = vi.fn(async () => []);

    const result = await fetchPage({ page: 1, pageSize: 10 }, async () => 0, fetch);

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [], page: 1, totalPages: 1, totalItems: 0 });
  });

  it('never asks for a zero or negative page size', async () => {
    const fetch = vi.fn(async () => rows(1));

    await fetchPage({ page: 1, pageSize: 0 }, async () => 5, fetch);

    expect(fetch).toHaveBeenCalledWith(1, 0);
  });
});
