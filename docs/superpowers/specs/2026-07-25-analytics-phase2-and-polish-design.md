# Analytics Phase 2: dashboard polish + drill-down pages

## Context

Phase 1 (PR #42, merged) shipped the 3 tracking-gap fixes and upgraded
`/admin/analytics` with a date-range picker, 4 charts, and %-change
tooltips — but the page itself looks rough: bare charts, plain `<ul>`/
`<table>` lists, inconsistent card padding across sections, and no
at-a-glance totals. Phase 2 was always going to add 4 dedicated
per-event-type pages, a per-user timeline, and CSV export on top of
Phase 1's primitives — but building those on today's plain components
would mean redoing them twice. So this phase does both together: fix the
shared presentation layer first, retrofit the main dashboard onto it,
then build the new pages on the improved components from the start.

A mockup of the redesigned Page views + Revenue sections was reviewed
and approved before writing this spec (StatCardRow of totals, ChartCard
wrapping, DataTable for lists) — see the brainstorming session for
reference; this spec is the source of truth going forward.

Non-goals: no third-party analytics/dashboard library (Tremor, Mantine,
etc. were considered and explicitly rejected — stays on the existing
CSS-Modules + CSS-variable design system, matching the rest of the app).
No period-over-period %-change on the new StatCards (they show plain
totals only — chart tooltips already cover %-change, adding it to
StatCards would require fetching a second date range per page load).
No new analytics service, no real-time updates, no aggregated-data
export — same non-goals as Phase 1, still true.

## Component architecture (the polish layer)

New components, colocated under
`src/app/(admin)/admin/analytics/components/` alongside the existing
Phase 1 chart components:

- **`StatCard`** — `{ label: string; value: string }`. Pure
  presentation: small uppercase muted label, large bold value. No
  %-change (see non-goals).
- **`StatCardRow`** — wraps 2-4 `StatCard`s in a responsive flex/grid
  row using the existing `--space-*` tokens; wraps to multiple rows on
  narrow viewports rather than overflowing or squeezing.
- **`DataTable<T>`** — `{ columns: { key: string; header: string;
  render?: (row: T) => ReactNode }[]; rows: T[]; emptyLabel: string }`.
  Renders a styled `<table>` (zebra striping, hover highlight,
  consistent header treatment) or the empty-state paragraph when `rows`
  is empty. Replaces the current ad hoc `<ul>`/`<table>` markup
  duplicated per list on the main dashboard, and backs every raw-event
  table in the 4 new pages below.
- **`ChartCard`** — `{ title: string; children: ReactNode }`. Wraps the
  existing `Card` component with the title/padding treatment currently
  copy-pasted 5 times in `page.tsx` as `<Card className={styles.chartCard}>
  <h3>...`.
- **`chart-theme.ts`** — shared constants consumed by `DailyBarChart`,
  `RevenueChart`, `OnChainChart`: a named color per series (page
  views/cart/revenue use `--color-accent`/`--color-success`, on-chain
  keeps its `#f7931a` BTC-orange as a named `BITCOIN_ORANGE` constant
  rather than inline), and a shared `<CartesianGrid strokeDasharray="3
  3">` + axis tick style so all four charts render consistently instead
  of each hand-tuning its own.

None of this touches the domain/application/infrastructure layers or
adds a dependency — it's presentation-only, reusing data already
fetched by Phase 1's use cases plus the small query addition and two new
use cases below.

## One query addition: `searchesPerDay`

Checked `GetWebAnalyticsSummaryResult` directly (`get-web-analytics-summary.ts`):
it has `pageViewsPerDay` and `cartChangesPerDay` but no `searchesPerDay` —
searches are only ever surfaced as a top-10 terms list, never a day
series. `/admin/analytics/searches` (below) needs a day chart the same
way the other 3 pages do, so `GetWebAnalyticsSummaryResult` gains
`searchesPerDay: DailyCount[]` via `countByTypePerDay('search', since,
until)`, mirroring how `cartChangesPerDay` was added in Phase 1. The main
dashboard's Searches section picks up a `DailyBarChart` for it too, for
consistency with Page views and Cart activity, which already have one.

This is the only query-layer change this phase needs beyond the two new
use cases below — everything else in the retrofit is presentation-only.

## Retrofit: main `/admin/analytics` page

Each of the 5 existing sections (Page views, Searches, Cart activity,
Revenue, On-chain) gains a `StatCardRow`. `GetWebAnalyticsSummaryResult`
has no distinct-session or distinct-term count, and `topSearchTerms`/
`topPaths` are capped at 10 (`TOP_LIMIT`), so neither can honestly back a
"unique X" stat. Rather than add a query for a single card, the
count-based sections use total + daily average — both derivable from
data already fetched plus the date range already in scope
(`total / number of days in [since, until]`):

- Page views: total views (`sum(pageViewsPerDay)`), daily average
- Searches: total searches (`sum(searchesPerDay)`), daily average
- Cart activity: total cart-change events (`sum(cartChangesPerDay)`),
  daily average
- Revenue: total revenue via `Money`, total items sold
  (`sum(days.map(d => d.totalQuantity))`)
- On-chain: total sats received, confirmed order count (already
  computed today in the existing summary cards — becomes `StatCard`s
  instead of their current ad hoc markup)

Top-paths/referrers/search-terms lists move onto `DataTable`. Every
chart gets wrapped in `ChartCard`. The 5-section structure and "View
details →" links are unchanged — this is a component-level retrofit,
not a structural rewrite.

## New use cases (analytics module)

- **`ListAnalyticsEvents`** — `{ eventType: 'page_view' | 'search' |
  'cart_changed'; since: Date; until: Date; limit: number; offset: number
  }` → `{ items: AnalyticsEventRow[]; total: number }`, newest first.
  Backs each of the 3 web-event pages' raw tables and their CSV exports
  (called with `EXPORT_LIMIT` instead of the page size, same reuse
  pattern as `ListAuditLogEntries` / `/api/admin/audit-log/export`).
- **`GetEventsForIdentity`** — `{ identity: string; since: Date; until:
  Date }` → chronological `AnalyticsEventRow[]` across all 3 web event
  types. Filters `analytics_events` by the `sessionId` column for both
  guest and logged-in lookups — logged-in users always have `sessionId
  === userId` at write time (confirmed in Phase 1's schema), so one
  query path covers both and the existing `(session_id, created_at)`
  index already serves it. No new migration.

Both are read-only, no `Money`/domain-state involved — thin repository
pass-throughs, consistent with `ListAuditLogEntries`.

## Page structure

- **`/admin/analytics/page-views`**, **`/searches`**, **`/cart`** — same
  shape: `DateRangePicker` → `StatCardRow` (total count) → `ChartCard`
  with `DailyBarChart` → `DataTable` of raw rows (25/page via the
  existing `Pagination` component, `?page=` query param preserving
  `from`/`to`) → "Export CSV" link → "View by user" link.
- **`/admin/analytics/on-chain`** — same shape but the raw-event table
  is replaced by the existing paid-orders table (on-chain data isn't in
  `analytics_events`); CSV export calls `GetOnChainActivityReport` with
  a wide range instead of `ListAnalyticsEvents`. No "view by user" link.
- **`/admin/analytics/users`** — one text input (email or raw
  session/user id) via GET form → resolves through
  `FindUserByEmailForAdmin`, falls back to treating the input as a raw
  session id if no account matches → `GetEventsForIdentity` →
  chronological `DataTable` timeline across all 3 event types. "No
  matching user or session found" when nothing resolves and nothing is
  found.

CSV export routes (`/api/admin/analytics/{type}/export`) mirror
`/api/admin/audit-log/export`: `requireAdmin()` gate, hand-rolled CSV via
the existing `csvEscape` pattern, `Content-Disposition: attachment`. The
bounded fetch uses `EXPORT_LIMIT = 50_000`, lower than the audit log's
`100_000` — analytics events are far higher-volume than curated audit
entries, and every export here is already scoped to the selected date
range via `from`/`to`, so the limit is a safety cap against an
accidentally huge range rather than the primary bound.

## Testing strategy

Same convention as Phase 1 and the rest of the repo: domain/use-case
unit tests only, no DOM, no DB.

- Unit tests for `ListAnalyticsEvents` (pagination math, date bounds,
  event-type filtering, total count) and `GetEventsForIdentity`
  (chronological ordering across types, `sessionId` filtering, empty
  result).
- Extend `get-web-analytics-summary.test.ts` to cover the new
  `searchesPerDay` field, same shape as the existing
  `cartChangesPerDay` assertion.
- No tests for `StatCard`/`StatCardRow`/`DataTable`/`ChartCard`/
  `chart-theme.ts` or any page/route handler — matches existing
  precedent (Phase 1's chart components and the audit-log export route
  are both untested for the same reason: presentational or thin
  pass-through, no jsdom/testing-library infra in this repo).

## Error handling & edge cases

- Empty states: every new table/chart uses `DataTable`'s `emptyLabel`
  ("No data yet.", matching Phase 1's existing pattern).
- `/users` lookup with no match: "No matching user or session found,"
  no timeline rendered.
- CSV export: same bounded-limit, admin-gated pattern as audit-log
  export — no unbounded query.
- Pagination: requesting a page past the last page re-fetches clamped to
  the last page (matches the existing `/admin/audit-log` pattern) rather
  than erroring or showing a blank page.
