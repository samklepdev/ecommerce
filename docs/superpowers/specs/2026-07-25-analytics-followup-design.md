# Analytics follow-up: tracking gaps + dashboard upgrade

## Context

PR #39 shipped the initial in-house analytics system: `page_view`/`search`/
`cart_changed` event tracking, the `order_events` payment/fulfillment
timeline, the on-chain activity report, and a single `/admin/analytics`
dashboard summarizing all of it over a fixed 30-day window.

Working through the remaining items on the personal todo list's Analytics
section, three tracking gaps and a dashboard-UX wishlist were left open:

- **Tracking gaps**: `cart_changed` only records the one line that changed
  (not the full cart), `order_created`'s captured `amountMinor` is never
  surfaced anywhere, and only `lineCount` (distinct lines) is captured, not
  total item quantity.
- **Dashboard wishlist**: charts, an adjustable time period, tooltip
  insights, drill-down into each event type's own data, day-by-day
  breakdowns for all event types (not just page views), and a way to see
  one user's/session's activity — plus raw-row CSV export per event type,
  added during brainstorming to match the existing audit-log export.

Delivered in two phases (agreed during brainstorming): **Phase 1** closes
the tracking gaps and builds the shared dashboard primitives (date range,
charts, tooltips) directly on the existing `/admin/analytics` page. **Phase
2** builds four dedicated per-event-type pages and the per-user timeline on
top of Phase 1's primitives. This ordering means the shared pieces get
built once and proven on the main dashboard before Phase 2 pages consume
them, rather than reinventing them four times.

Non-goals: no new third-party analytics service (stays in-house, same as
today), no real-time/streaming updates (still request-time reads like the
rest of the app), no export of aggregated/summary data (raw rows only).

## Data model changes

No new tables.

- **`cart_changed` metadata** changes shape from `{variantId, quantity,
  lineCount}` to `{lines: [{variantId, quantity}]}` — the full cart
  snapshot after the mutation, not just the line that changed. `metadata`
  is `jsonb`, so this is a code-level contract change in `AddToCart` /
  `UpdateCartLineQuantity`, not a migration.
- **`order_created` metadata** gains `quantity` (sum of line quantities)
  alongside the existing `amountMinor`/`lineCount`, in
  `DrizzleOrderRepository.create()`. Same deal — no migration.
- **Two new indexes** (real migration via `db:generate`):
  - `analytics_events_session_id_created_at_idx` on `(session_id,
    created_at)` — makes the per-user timeline lookup (all events for one
    session/user, chronological) sane at scale.
  - `order_events_type_created_at_idx` on `(event_type, created_at)` —
    for the new day-grouped revenue query; mirrors the existing
    `analytics_events_type_created_at_idx`.

Email→identity resolution for the user-lookup search box reuses the
existing `FindUserByEmailForAdmin` use case rather than adding new lookup
logic.

## Query/report layer changes

- `GetWebAnalyticsSummary` and `GetOnChainActivityReport` change their
  input from `{ sinceDays }` to `{ since: Date; until: Date }`; their
  repository methods (`countByTypePerDay`, `topValues`, `topSearchTerms`,
  `listConfirmedWithOrderInfo`) gain an `until` upper bound alongside the
  existing `since` lower bound.
- New use case **`GetRevenueSummary`** (orders module) — reads
  `order_events` where `eventType = 'order_created'`, aggregates
  `amountMinor`/`quantity` from metadata per day. Powers the new revenue
  chart. Missing `quantity` on pre-migration events coalesces to `0` rather
  than failing.
- New use case **`ListAnalyticsEvents`** (analytics module) — paginated raw
  rows for one of the three web event types + date range. Backs both a
  per-type page's raw table and the `page_view`/`search`/`cart_changed`
  CSV export routes, which call it with a large limit — same reuse pattern
  as `/api/admin/audit-log/export`, which calls `ListAuditLogEntries` with
  `EXPORT_LIMIT` instead of a separate export use case. The on-chain CSV
  export is a separate case: it has no `analytics_events` rows to read, so
  its export route calls `GetOnChainActivityReport` (the same use case the
  on-chain page already renders) with a large date range instead.
- New use case **`GetEventsForIdentity`** (analytics module) —
  chronological raw `analytics_events` rows (all three types) for one
  session or user id. Powers the per-user timeline. Deliberately scoped to
  web events only — an order's own payment/fulfillment history already has
  a dedicated view (the existing order-detail Timeline from PR #39), so
  this doesn't duplicate that.
- A shared pure utility, `parseDateRange(searchParams, defaultDays = 30)`,
  normalizes `from`/`to` query params into `{ since, until }`: defaults to
  the last `defaultDays` days when missing/invalid, swaps `from`/`to` if
  `from > to`. Used by all 5 analytics pages. Unit tested the same way
  `shouldRefreshOnStatusChange` was in the BTC-checkout stale-status fix —
  a pure function pulled out specifically so it doesn't need
  component-testing infra to verify.
- The tooltip's %-change is computed client-side from the already-fetched
  daily series (comparing a point to the immediately preceding point in
  the same series) — no extra query, no new use case. First point in a
  series has no prior point, so its tooltip omits the %-change line.

## Shared UI components

Colocated under `src/app/(admin)/admin/analytics/components/` and reused by
the main dashboard and all 4 Phase 2 pages. (Only `page.tsx`/`route.tsx`
are special in the App Router — anything else in a route folder is just a
regular module.)

- **`DateRangePicker`** — a plain GET `<form>` with two `<input
  type="date">` (from/to) + submit button. No client JS. Submits back to
  the same page URL with updated `from`/`to` query params, matching the
  existing searchParams-driven filtering already used on the products
  page's search/category filters.
- **`ChartTooltip`** — one shared Recharts tooltip renderer used by every
  chart below; shows the hovered point's value plus %-change vs. the
  previous point.
- **`DailyBarChart`** — generic count-per-day bar chart, takes
  `DailyCount[]`. Used for page-views/day, searches/day, cart-changes/day.
- **`RevenueChart`** — day-grouped revenue + quantity, dual series.
- **`OnChainChart`** — sats received per day.
- **Export link** — plain `<a
  href="/api/admin/analytics/{type}/export?from=&to=">Export CSV</a>`, no
  JS, matching the existing audit-log export link exactly.

`recharts` is added as a new dependency for the four chart components
above (chosen over hand-rolled SVG/CSS charts during brainstorming, for
tooltip/interaction behavior largely for free).

## Page structure

- **`/admin/analytics`** (existing, updated) — `DateRangePicker` at top
  applies to every section below (replaces the hardcoded 30-day window).
  Web section keeps its top-paths/referrers/search-terms tables and gains
  a page-views `DailyBarChart`. New **Revenue** section with
  `RevenueChart`. On-chain section gains `OnChainChart` above its existing
  summary cards + paid-orders table. Each of the 4 areas gets a "View
  details →" link to its Phase 2 page.
- **`/admin/analytics/page-views`** — day chart, top paths, top referrers,
  paginated raw-event table, CSV export, "View by user" link.
- **`/admin/analytics/searches`** — day chart, top search terms,
  paginated raw-event table, CSV export, "View by user" link.
- **`/admin/analytics/cart`** — day chart, paginated raw-event table
  (rendering each event's cart-snapshot `lines`), CSV export, "View by
  user" link.
- **`/admin/analytics/on-chain`** — sats-per-day chart, the existing
  paid-orders table, CSV export of confirmed-order rows. No "view by
  user" — on-chain activity isn't tied to a session/user identity the way
  web events are.
- **`/admin/analytics/users`** — shared identity-lookup page: one text
  input (email or raw session/user id, GET form → `?identity=`), resolves
  email via `FindUserByEmailForAdmin`, otherwise treats the input as a raw
  session/user id. Shows a chronological timeline of that identity's web
  events (all 3 types) across the selected date range.

## Testing strategy

Matches this repo's existing convention: domain/use-case unit tests only,
no DB, no DOM.

- Unit tests for every changed/new use case: `GetWebAnalyticsSummary` /
  `GetOnChainActivityReport` with the new `until` bound, `GetRevenueSummary`,
  `ListAnalyticsEvents`, `GetEventsForIdentity`.
- Unit tests for the updated `AddToCart`/`UpdateCartLineQuantity` metadata
  shape (full line snapshot instead of single-line diff).
- Unit tests for the two pure helpers: `parseDateRange` and the tooltip's
  %-change calculation.
- No component tests for the chart/page UI — this repo has no
  jsdom/testing-library setup (same call made for the `BitcoinCheckout`
  stale-status fix); verified manually in-browser instead.

## Error handling & edge cases

- Invalid/missing `from`/`to` → `parseDateRange` defaults to the last 30
  days; `from > to` swaps them rather than erroring.
- No data in range → existing empty-state pattern ("No data yet.")
  extended to every new chart/table.
- User lookup with no matching email or plausible session/user id → "No
  matching user or session found," no timeline shown.
- Pre-migration `order_created` events won't have `quantity` in metadata —
  `GetRevenueSummary` coalesces missing quantity to `0` rather than
  failing.
- CSV export reuses the audit-log export's admin-gate + bounded-limit
  pattern (no unbounded query).
