# Analytics Dashboard Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 3 analytics tracking gaps (cart snapshot, order value, order quantity) and upgrade `/admin/analytics` with a custom date range, charts (page views, revenue, on-chain), and %-change tooltips — the shared infrastructure Phase 2's four dedicated pages will reuse.

**Architecture:** Clean Architecture, unchanged from the rest of the repo — domain has no infra imports, use cases depend on ports, `src/app/**` calls use cases only via `getContainer()`. New chart/date-range components are presentation-only (no business logic), colocated under `src/app/(admin)/admin/analytics/components/`. `recharts` is a new dependency for the chart components only.

**Tech Stack:** Next.js App Router, TypeScript strict, Drizzle ORM, PostgreSQL, Vitest, `recharts`.

## Global Constraints

- Money: never floats, always through the `Money` value object with an explicit currency (`CLAUDE.md`).
- `src/app/**` calls use cases only — never repositories or the DB client directly.
- Ports live in `application/ports`; implementations in `infrastructure`. Use cases depend on the port.
- Domain/use-case tests must run without a database or network (this repo has no jsdom/component-testing infra — don't add any).
- Files: `kebab-case.ts`. Classes/types: `PascalCase`. Use cases: verb-first.
- Wire every new use case in `src/composition/container.ts` — never `new` an adapter inside a use case.
- Every step that touches code must leave `npm run typecheck`, `npm run lint`, and `npm test` passing before its commit.

---

### Task 1: Schema indexes for the per-user timeline and revenue queries

**Files:**
- Modify: `src/shared/infrastructure/db/schema.ts` (the `analyticsEvents` and `orderEvents` table definitions)
- Create: migration files via `npm run db:generate` (exact filename is generated — do not hand-write it)

**Interfaces:**
- Consumes: nothing (schema-only change)
- Produces: two new Postgres indexes — `analytics_events_session_id_created_at_idx` on `(session_id, created_at)`, `order_events_type_created_at_idx` on `(event_type, created_at)` — that later tasks' queries will rely on for performance, though no task takes a hard dependency on their existence to be *correct*.

- [ ] **Step 1: Add the `analyticsEvents` index**

In `src/shared/infrastructure/db/schema.ts`, find the `analyticsEvents` table definition:

```ts
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(), // page_view | search | cart_changed
    sessionId: text('session_id'), // guest_session_id or the logged-in user's id
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    path: text('path'),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeCreatedAtIdx: index('analytics_events_type_created_at_idx').on(t.eventType, t.createdAt),
  }),
);
```

Change the index block to add a second index:

```ts
  (t) => ({
    typeCreatedAtIdx: index('analytics_events_type_created_at_idx').on(t.eventType, t.createdAt),
    sessionIdCreatedAtIdx: index('analytics_events_session_id_created_at_idx').on(
      t.sessionId,
      t.createdAt,
    ),
  }),
```

- [ ] **Step 2: Add the `orderEvents` index**

Find the `orderEvents` table definition:

```ts
export const orderEvents = pgTable(
  'order_events',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(), // order_created | payment_status_changed | fulfillment_status_changed
    status: text('status').notNull(), // the new value, e.g. 'paid', 'shipped', 'expired'
    metadata: jsonb('metadata'), // amountMinor + lineCount on order_created
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index('order_events_order_id_idx').on(t.orderId),
  }),
);
```

Change the index block:

```ts
  (t) => ({
    orderIdx: index('order_events_order_id_idx').on(t.orderId),
    typeCreatedAtIdx: index('order_events_type_created_at_idx').on(t.eventType, t.createdAt),
  }),
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/00XX_<generated-name>.sql` file containing two `CREATE INDEX` statements, plus updated `drizzle/meta/00XX_snapshot.json` and `drizzle/meta/_journal.json`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/infrastructure/db/schema.ts drizzle/
git commit -m "feat(analytics): add indexes for per-user timeline and revenue queries"
```

---

### Task 2: `AddToCart` records a full cart snapshot, not just the changed line

**Files:**
- Modify: `src/modules/cart/application/use-cases/add-to-cart.ts`
- Test: `src/modules/cart/application/use-cases/add-to-cart.test.ts`

**Interfaces:**
- Consumes: `CartLine.variantId: string`, `CartLine.quantity: number` (existing getters on `src/modules/cart/domain/cart-line.ts`)
- Produces: `cart_changed` events now carry `metadata: { lines: { variantId: string; quantity: number }[] }` — Task 3 and any future consumer of this event type (Phase 2's cart page) must read `metadata.lines`, not `metadata.variantId`/`metadata.quantity`/`metadata.lineCount`.

- [ ] **Step 1: Update the failing-first test**

In `src/modules/cart/application/use-cases/add-to-cart.test.ts`, replace the `metadata` assertion inside the `'records a cart_changed analytics event when a repository is provided'` test:

```ts
    expect(recorded).toEqual([
      {
        eventType: 'cart_changed',
        sessionId: 's1',
        userId: null,
        metadata: { lines: [{ variantId, quantity: 2 }] },
      },
    ]);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/cart/application/use-cases/add-to-cart.test.ts`
Expected: FAIL on the `records a cart_changed analytics event` test — actual metadata is `{ variantId, quantity: 2, lineCount: 1 }`, not `{ lines: [...] }`.

- [ ] **Step 3: Update the implementation**

In `src/modules/cart/application/use-cases/add-to-cart.ts`, replace the `metadata` line inside the `record` call:

```ts
          metadata: { lines: updated.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) },
```

(This replaces `metadata: { variantId: input.variantId, quantity: input.quantity, lineCount: updated.lines.length },`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/cart/application/use-cases/add-to-cart.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/cart/application/use-cases/add-to-cart.ts src/modules/cart/application/use-cases/add-to-cart.test.ts
git commit -m "feat(analytics): AddToCart records a full cart snapshot"
```

---

### Task 3: `UpdateCartLineQuantity` records a full cart snapshot

**Files:**
- Modify: `src/modules/cart/application/use-cases/update-cart-line-quantity.ts`
- Test: `src/modules/cart/application/use-cases/update-cart-line-quantity.test.ts`

**Interfaces:**
- Consumes: same as Task 2 — `CartLine.variantId`, `CartLine.quantity`
- Produces: same `metadata: { lines: {...}[] }` shape as Task 2, for the same `cart_changed` event type — the two use cases must stay in sync on this shape since Phase 2's cart page reads both indiscriminately.

- [ ] **Step 1: Update the failing-first test**

In `src/modules/cart/application/use-cases/update-cart-line-quantity.test.ts`, replace the `metadata` assertion inside `'records a cart_changed analytics event when a repository is provided'`:

```ts
    expect(recorded).toEqual([
      {
        eventType: 'cart_changed',
        sessionId: 'u1',
        userId: 'u1',
        metadata: { lines: [{ variantId, quantity: 4 }] },
      },
    ]);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/cart/application/use-cases/update-cart-line-quantity.test.ts`
Expected: FAIL — actual metadata is `{ variantId, quantity: 4, lineCount: 1 }`.

- [ ] **Step 3: Update the implementation**

In `src/modules/cart/application/use-cases/update-cart-line-quantity.ts`, replace the `metadata` line:

```ts
          metadata: { lines: updated.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/cart/application/use-cases/update-cart-line-quantity.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/cart/application/use-cases/update-cart-line-quantity.ts src/modules/cart/application/use-cases/update-cart-line-quantity.test.ts
git commit -m "feat(analytics): UpdateCartLineQuantity records a full cart snapshot"
```

---

### Task 4: `order_created` event captures total item quantity

**Files:**
- Modify: `src/modules/orders/infrastructure/drizzle-order-repository.ts` (the `create()` method, around line 128)

**Interfaces:**
- Consumes: `Order.lines: OrderLine[]`, each with a `.quantity: number` getter (existing domain type)
- Produces: `order_created` `order_events` rows now carry `metadata.quantity: number` (sum of line quantities) alongside the existing `amountMinor`/`lineCount`. Task 8 (`GetRevenueSummary`) reads this field, coalescing to `0` when absent (older, pre-this-change rows won't have it).

No test for this step: `DrizzleOrderRepository` is infrastructure and this repo doesn't unit-test infra (matches the existing convention — there's no test file for this class today). Verified via typecheck + the full suite staying green, same as the rest of this repository's Drizzle-adapter changes.

- [ ] **Step 1: Update the metadata**

In `src/modules/orders/infrastructure/drizzle-order-repository.ts`, find:

```ts
      await this.recordOrderEvent(tx, order.id, 'order_created', order.paymentStatus, {
        amountMinor: order.total.amountMinor,
        lineCount: order.lines.length,
      });
```

Replace with:

```ts
      await this.recordOrderEvent(tx, order.id, 'order_created', order.paymentStatus, {
        amountMinor: order.total.amountMinor,
        lineCount: order.lines.length,
        quantity: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      });
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm test`
Expected: no errors, all existing tests still pass (this file has no direct unit tests, so the suite count is unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/modules/orders/infrastructure/drizzle-order-repository.ts
git commit -m "feat(analytics): capture total item quantity on order_created events"
```

---

### Task 5: `parseDateRange` — shared date-range parsing utility

**Files:**
- Create: `src/app/(admin)/admin/analytics/date-range.ts`
- Test: `src/app/(admin)/admin/analytics/date-range.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export interface DateRange { since: Date; until: Date; }
  export interface DateRangeSearchParams { from?: string; to?: string; }
  export function parseDateRange(searchParams: DateRangeSearchParams, defaultDays?: number): DateRange;
  ```
  Task 16 (main dashboard page) is the first consumer; Phase 2's four pages will import this same function.

- [ ] **Step 1: Write the failing test**

Create `src/app/(admin)/admin/analytics/date-range.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseDateRange } from './date-range';

describe('parseDateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to the last 30 days when no params are given', () => {
    const { since, until } = parseDateRange({});

    expect(until).toEqual(new Date('2026-07-25T12:00:00Z'));
    expect(since).toEqual(new Date('2026-06-25T12:00:00Z'));
  });

  it('defaults to a custom window when defaultDays is given', () => {
    const { since, until } = parseDateRange({}, 7);

    expect(until).toEqual(new Date('2026-07-25T12:00:00Z'));
    expect(since).toEqual(new Date('2026-07-18T12:00:00Z'));
  });

  it('uses explicit from/to, treating to as inclusive of that whole day', () => {
    const { since, until } = parseDateRange({ from: '2026-01-01', to: '2026-01-10' });

    expect(since).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(until).toEqual(new Date('2026-01-10T23:59:59.999Z'));
  });

  it('falls back to the default when a param is not a valid date', () => {
    const { since, until } = parseDateRange({ from: 'not-a-date', to: '2026-01-10' });

    expect(since).toEqual(new Date('2026-06-25T12:00:00Z'));
    expect(until).toEqual(new Date('2026-01-10T23:59:59.999Z'));
  });

  it('swaps an inverted range instead of erroring', () => {
    const { since, until } = parseDateRange({ from: '2026-01-10', to: '2026-01-01' });

    expect(since.getTime()).toBeLessThanOrEqual(until.getTime());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/\(admin\)/admin/analytics/date-range.test.ts`
Expected: FAIL — `date-range.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/app/(admin)/admin/analytics/date-range.ts`:

```ts
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

  return since.getTime() > until.getTime() ? { since: until, until: since } : { since, until };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/\(admin\)/admin/analytics/date-range.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/analytics/date-range.ts" "src/app/(admin)/admin/analytics/date-range.test.ts"
git commit -m "feat(analytics): add parseDateRange utility for the date-range picker"
```

---

### Task 6: `GetWebAnalyticsSummary` takes a custom range and adds cart-activity-per-day

**Files:**
- Modify: `src/modules/analytics/application/ports/analytics-event-repository.ts`
- Modify: `src/modules/analytics/infrastructure/drizzle-analytics-event-repository.ts`
- Modify: `src/modules/analytics/application/use-cases/get-web-analytics-summary.ts`
- Test: `src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  ```ts
  export interface GetWebAnalyticsSummaryInput { since: Date; until: Date; }
  export interface GetWebAnalyticsSummaryResult {
    pageViewsPerDay: DailyCount[];
    topPaths: ValueCount[];
    topReferrers: ValueCount[];
    topSearchTerms: ValueCount[];
    cartChangesPerDay: DailyCount[];
  }
  ```
  Task 16 (main dashboard) is the consumer for the new `cartChangesPerDay` field and the `since`/`until` input shape.

- [ ] **Step 1: Update the port**

In `src/modules/analytics/application/ports/analytics-event-repository.ts`, replace the `AnalyticsEventRepository` interface's query methods:

```ts
export interface AnalyticsEventRepository {
  record(event: AnalyticsEventInput): Promise<void>;
  countByTypePerDay(eventType: AnalyticsEventType, since: Date, until: Date): Promise<DailyCount[]>;
  topValues(
    eventType: AnalyticsEventType,
    field: 'path' | 'referrer',
    since: Date,
    until: Date,
    limit: number,
  ): Promise<ValueCount[]>;
  /** Top search terms, read from `metadata.term` on `search` events. */
  topSearchTerms(since: Date, until: Date, limit: number): Promise<ValueCount[]>;
}
```

- [ ] **Step 2: Update the failing-first use-case test**

Replace `src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest';

import { GetWebAnalyticsSummary } from './get-web-analytics-summary';
import type { AnalyticsEventRepository, DailyCount, ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';

describe('GetWebAnalyticsSummary', () => {
  it('aggregates page views, cart changes, top paths, top referrers, and top search terms', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const pageViewsPerDay: DailyCount[] = [{ day: '2026-01-01', count: 5 }];
    const cartChangesPerDay: DailyCount[] = [{ day: '2026-01-01', count: 2 }];
    const topPaths: ValueCount[] = [{ value: '/products', count: 5 }];
    const topReferrers: ValueCount[] = [{ value: 'https://google.com', count: 3 }];
    const topSearchTerms: ValueCount[] = [{ value: 'test', count: 2 }];

    const repo: AnalyticsEventRepository = {
      async record() {},
      async countByTypePerDay(eventType, s, u) {
        expect(s).toBe(since);
        expect(u).toBe(until);
        return eventType === 'page_view' ? pageViewsPerDay : cartChangesPerDay;
      },
      async topValues(eventType, field) {
        expect(eventType).toBe('page_view');
        return field === 'path' ? topPaths : topReferrers;
      },
      async topSearchTerms() {
        return topSearchTerms;
      },
    };

    const result = await new GetWebAnalyticsSummary(repo).execute({ since, until });

    expect(result).toEqual({ pageViewsPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts`
Expected: FAIL — `execute` still expects `{ sinceDays }` and doesn't query `cart_changed`.

- [ ] **Step 4: Update the use case**

Replace `src/modules/analytics/application/use-cases/get-web-analytics-summary.ts` entirely:

```ts
import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventRepository,
  DailyCount,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export interface GetWebAnalyticsSummaryInput {
  since: Date;
  until: Date;
}

export interface GetWebAnalyticsSummaryResult {
  pageViewsPerDay: DailyCount[];
  topPaths: ValueCount[];
  topReferrers: ValueCount[];
  topSearchTerms: ValueCount[];
  cartChangesPerDay: DailyCount[];
}

const TOP_LIMIT = 10;

export class GetWebAnalyticsSummary
  implements UseCase<GetWebAnalyticsSummaryInput, GetWebAnalyticsSummaryResult>
{
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: GetWebAnalyticsSummaryInput): Promise<GetWebAnalyticsSummaryResult> {
    const { since, until } = input;

    const [pageViewsPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay] =
      await Promise.all([
        this.events.countByTypePerDay('page_view', since, until),
        this.events.topValues('page_view', 'path', since, until, TOP_LIMIT),
        this.events.topValues('page_view', 'referrer', since, until, TOP_LIMIT),
        this.events.topSearchTerms(since, until, TOP_LIMIT),
        this.events.countByTypePerDay('cart_changed', since, until),
      ]);

    return { pageViewsPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the infrastructure adapter**

Replace `src/modules/analytics/infrastructure/drizzle-analytics-event-repository.ts` entirely:

```ts
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { analyticsEvents } from '@/shared/infrastructure/db/schema';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
  AnalyticsEventType,
  DailyCount,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export class DrizzleAnalyticsEventRepository implements AnalyticsEventRepository {
  constructor(private readonly db: DB) {}

  async record(event: AnalyticsEventInput): Promise<void> {
    await this.db.insert(analyticsEvents).values({
      id: randomUUID(),
      eventType: event.eventType,
      sessionId: event.sessionId,
      userId: event.userId,
      path: event.path ?? null,
      referrer: event.referrer ?? null,
      userAgent: event.userAgent ?? null,
      ipAddress: event.ipAddress ?? null,
      metadata: event.metadata ?? null,
    });
  }

  async countByTypePerDay(eventType: AnalyticsEventType, since: Date, until: Date): Promise<DailyCount[]> {
    const rows = await this.db
      .select({
        day: sql<string>`to_char(${analyticsEvents.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
  }

  async topValues(
    eventType: AnalyticsEventType,
    field: 'path' | 'referrer',
    since: Date,
    until: Date,
    limit: number,
  ): Promise<ValueCount[]> {
    const column = field === 'path' ? analyticsEvents.path : analyticsEvents.referrer;
    const rows = await this.db
      .select({ value: column, count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          sql`${column} is not null`,
        ),
      )
      .groupBy(column)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    return rows.map((r) => ({ value: r.value ?? '', count: Number(r.count) }));
  }

  async topSearchTerms(since: Date, until: Date, limit: number): Promise<ValueCount[]> {
    const term = sql<string>`${analyticsEvents.metadata}->>'term'`;
    const rows = await this.db
      .select({ value: term, count: sql<number>`count(*)` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'search'),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
          sql`${analyticsEvents.metadata}->>'term' is not null`,
        ),
      )
      .groupBy(term)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
  }
}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/modules/analytics/application/ports/analytics-event-repository.ts src/modules/analytics/infrastructure/drizzle-analytics-event-repository.ts src/modules/analytics/application/use-cases/get-web-analytics-summary.ts src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts
git commit -m "feat(analytics): custom date range + cart-activity-per-day on GetWebAnalyticsSummary"
```

---

### Task 7: `GetOnChainActivityReport` takes a custom range and adds sats-per-day

**Files:**
- Modify: `src/modules/payments/application/use-cases/get-on-chain-activity-report.ts`
- Modify: `src/modules/payments/infrastructure/bitcoin/drizzle-bitcoin-payment-store.ts`
- Test: `src/modules/payments/application/use-cases/get-on-chain-activity-report.test.ts`

**Interfaces:**
- Consumes: `OnChainOrderActivity.paidAt: Date`, `.expectedSats: number` (existing fields)
- Produces:
  ```ts
  export interface GetOnChainActivityReportInput { since: Date; until: Date; }
  export interface DailySats { day: string; sats: number; }
  export interface GetOnChainActivityReportResult {
    totalSats: number;
    addressCount: number;
    orders: OnChainOrderActivity[];
    satsPerDay: DailySats[];
  }
  ```
  Task 16 (main dashboard) and Task 18 (`OnChainChart`) consume `satsPerDay`.

- [ ] **Step 1: Update the failing-first test**

Replace `src/modules/payments/application/use-cases/get-on-chain-activity-report.test.ts` entirely:

```ts
import { describe, expect, it } from 'vitest';

import {
  GetOnChainActivityReport,
  type OnChainActivityReportRepository,
  type OnChainOrderActivity,
} from './get-on-chain-activity-report';

describe('GetOnChainActivityReport', () => {
  it('sums sats, counts distinct addresses, and groups sats by day', async () => {
    const orders: OnChainOrderActivity[] = [
      { orderId: 'o1', address: 'addr1', expectedSats: 100000, underpaid: false, overpaid: false, confirmations: 3, paidAt: new Date('2026-01-01T10:00:00Z') },
      { orderId: 'o2', address: 'addr2', expectedSats: 50000, underpaid: true, overpaid: false, confirmations: 3, paidAt: new Date('2026-01-01T18:00:00Z') },
      { orderId: 'o3', address: 'addr1', expectedSats: 25000, underpaid: false, overpaid: false, confirmations: 3, paidAt: new Date('2026-01-02T09:00:00Z') },
    ];
    const repo: OnChainActivityReportRepository = {
      async listConfirmedWithOrderInfo(since, until) {
        expect(since).toBeInstanceOf(Date);
        expect(until).toBeInstanceOf(Date);
        return orders;
      },
    };

    const result = await new GetOnChainActivityReport(repo).execute({
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({
      totalSats: 175000,
      addressCount: 2,
      orders,
      satsPerDay: [
        { day: '2026-01-01', sats: 150000 },
        { day: '2026-01-02', sats: 25000 },
      ],
    });
  });

  it('returns zeros and an empty day list for no activity', async () => {
    const repo: OnChainActivityReportRepository = {
      async listConfirmedWithOrderInfo() {
        return [];
      },
    };

    const result = await new GetOnChainActivityReport(repo).execute({
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({ totalSats: 0, addressCount: 0, orders: [], satsPerDay: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/payments/application/use-cases/get-on-chain-activity-report.test.ts`
Expected: FAIL — `execute` still expects `{ sinceDays }` and doesn't return `satsPerDay`.

- [ ] **Step 3: Update the use case**

Replace `src/modules/payments/application/use-cases/get-on-chain-activity-report.ts` entirely:

```ts
import type { UseCase } from '@/shared/application/use-case';

export interface OnChainOrderActivity {
  orderId: string;
  address: string;
  /** Proxy for actually-received sats — accurate in the common exact-payment
   * case; `underpaid`/`overpaid` are surfaced per-row so an admin can see
   * where this might be off, rather than presenting a falsely-precise
   * total. Deliberately not derived from live chain data — see
   * `GetOnChainActivityReport`'s doc comment. */
  expectedSats: number;
  underpaid: boolean;
  overpaid: boolean;
  confirmations: number;
  paidAt: Date;
}

export interface OnChainActivityReportRepository {
  /** `orders.paymentStatus = 'paid'` joined with `bitcoin_payment_intents`,
   * within `[since, until]`. */
  listConfirmedWithOrderInfo(since: Date, until: Date): Promise<OnChainOrderActivity[]>;
}

export interface GetOnChainActivityReportInput {
  since: Date;
  until: Date;
}

export interface DailySats {
  day: string;
  sats: number;
}

export interface GetOnChainActivityReportResult {
  totalSats: number;
  addressCount: number;
  orders: OnChainOrderActivity[];
  satsPerDay: DailySats[];
}

/**
 * Deliberately read-only, built entirely from already-durable data — never
 * touches ConfirmPayment, the gateway, or the chain watcher. Actual
 * confirmed sats aren't persisted anywhere (computed in-memory by the
 * watcher and discarded); persisting them would mean instrumenting the
 * most sensitive part of this codebase for a reporting nice-to-have, which
 * isn't worth the risk. `expectedSats` on a paid order is an accurate
 * stand-in in the overwhelming common exact-payment case.
 */
export class GetOnChainActivityReport
  implements UseCase<GetOnChainActivityReportInput, GetOnChainActivityReportResult>
{
  constructor(private readonly report: OnChainActivityReportRepository) {}

  async execute(input: GetOnChainActivityReportInput): Promise<GetOnChainActivityReportResult> {
    const orders = await this.report.listConfirmedWithOrderInfo(input.since, input.until);

    const totalSats = orders.reduce((sum, o) => sum + o.expectedSats, 0);
    const addressCount = new Set(orders.map((o) => o.address)).size;

    const byDay = new Map<string, number>();
    for (const o of orders) {
      const day = o.paidAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + o.expectedSats);
    }
    const satsPerDay = [...byDay.entries()]
      .map(([day, sats]) => ({ day, sats }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return { totalSats, addressCount, orders, satsPerDay };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/payments/application/use-cases/get-on-chain-activity-report.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the infrastructure adapter**

In `src/modules/payments/infrastructure/bitcoin/drizzle-bitcoin-payment-store.ts`:

Change the import line:

```ts
import { and, eq, gt, gte, lte } from 'drizzle-orm';
```

Change the `listConfirmedWithOrderInfo` method:

```ts
  async listConfirmedWithOrderInfo(since: Date, until: Date): Promise<OnChainOrderActivity[]> {
    const rows = await this.db
      .select({
        orderId: orders.id,
        address: bitcoinPaymentIntents.address,
        expectedSats: bitcoinPaymentIntents.expectedSats,
        underpaid: bitcoinPaymentIntents.underpaid,
        overpaid: bitcoinPaymentIntents.overpaid,
        confirmations: bitcoinPaymentIntents.confirmations,
        paidAt: orders.updatedAt,
      })
      .from(bitcoinPaymentIntents)
      .innerJoin(orders, eq(orders.id, bitcoinPaymentIntents.orderId))
      .where(
        and(
          eq(orders.paymentStatus, 'paid'),
          gte(orders.updatedAt, since),
          lte(orders.updatedAt, until),
        ),
      );
    return rows;
  }
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/payments/application/use-cases/get-on-chain-activity-report.ts src/modules/payments/application/use-cases/get-on-chain-activity-report.test.ts src/modules/payments/infrastructure/bitcoin/drizzle-bitcoin-payment-store.ts
git commit -m "feat(analytics): custom date range + sats-per-day on GetOnChainActivityReport"
```

---

### Task 8: `GetRevenueSummary` — new use case for the revenue chart

**Files:**
- Create: `src/modules/orders/application/use-cases/get-revenue-summary.ts`
- Test: `src/modules/orders/application/use-cases/get-revenue-summary.test.ts`
- Modify: `src/modules/orders/infrastructure/drizzle-order-repository.ts` (implement the new port)

**Interfaces:**
- Consumes: `order_events` rows with `eventType = 'order_created'` and `metadata.amountMinor`/`metadata.quantity` (produced by Task 4 and the existing `create()` method), joined to `orders.currency`.
- Produces:
  ```ts
  export interface DailyRevenue { day: string; totalMinor: number; orderCount: number; totalQuantity: number; }
  export interface RevenueSummaryRepository {
    getDailyRevenue(since: Date, until: Date): Promise<{ currency: string | null; days: DailyRevenue[] }>;
  }
  export interface GetRevenueSummaryInput { since: Date; until: Date; }
  export interface GetRevenueSummaryResult { currency: string; days: DailyRevenue[]; }
  export class GetRevenueSummary implements UseCase<GetRevenueSummaryInput, GetRevenueSummaryResult>
  ```
  Task 9 (container wiring) and Task 16 (main dashboard) consume `GetRevenueSummary`; Task 17 (`RevenueChart`) consumes `DailyRevenue[]`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/orders/application/use-cases/get-revenue-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  GetRevenueSummary,
  type DailyRevenue,
  type RevenueSummaryRepository,
} from './get-revenue-summary';

describe('GetRevenueSummary', () => {
  it('passes through the repository result', async () => {
    const days: DailyRevenue[] = [
      { day: '2026-01-01', totalMinor: 5000, orderCount: 2, totalQuantity: 3 },
    ];
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const repo: RevenueSummaryRepository = {
      async getDailyRevenue(s, u) {
        expect(s).toBe(since);
        expect(u).toBe(until);
        return { currency: 'USD', days };
      },
    };

    const result = await new GetRevenueSummary(repo).execute({ since, until });

    expect(result).toEqual({ currency: 'USD', days });
  });

  it('defaults currency to USD when there is no revenue in range', async () => {
    const repo: RevenueSummaryRepository = {
      async getDailyRevenue() {
        return { currency: null, days: [] };
      },
    };

    const result = await new GetRevenueSummary(repo).execute({
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({ currency: 'USD', days: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/orders/application/use-cases/get-revenue-summary.test.ts`
Expected: FAIL — `get-revenue-summary.ts` doesn't exist yet.

- [ ] **Step 3: Write the use case**

Create `src/modules/orders/application/use-cases/get-revenue-summary.ts`:

```ts
import type { UseCase } from '@/shared/application/use-case';

export interface DailyRevenue {
  day: string;
  totalMinor: number;
  orderCount: number;
  totalQuantity: number;
}

export interface RevenueSummaryRepository {
  /** `order_events` rows where `eventType = 'order_created'`, joined to
   * `orders` for currency, grouped by day, within `[since, until]`.
   * `currency` is `null` only when there's no revenue in range at all —
   * this store only ever creates orders in one currency (see
   * `CLAUDE.md`'s Money conventions), so there's nothing to reconcile
   * across rows when there is data. */
  getDailyRevenue(since: Date, until: Date): Promise<{ currency: string | null; days: DailyRevenue[] }>;
}

export interface GetRevenueSummaryInput {
  since: Date;
  until: Date;
}

export interface GetRevenueSummaryResult {
  currency: string;
  days: DailyRevenue[];
}

const FALLBACK_CURRENCY = 'USD';

export class GetRevenueSummary implements UseCase<GetRevenueSummaryInput, GetRevenueSummaryResult> {
  constructor(private readonly repo: RevenueSummaryRepository) {}

  async execute(input: GetRevenueSummaryInput): Promise<GetRevenueSummaryResult> {
    const { currency, days } = await this.repo.getDailyRevenue(input.since, input.until);
    return { currency: currency ?? FALLBACK_CURRENCY, days };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/orders/application/use-cases/get-revenue-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the port on `DrizzleOrderRepository`**

In `src/modules/orders/infrastructure/drizzle-order-repository.ts`:

Update the import line that currently reads:

```ts
import { and, eq, ilike, inArray, isNotNull, lt } from 'drizzle-orm';
```

to:

```ts
import { and, eq, gte, ilike, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
```

Add a new type-only import alongside the existing `ListOrderEventsRepository` import:

```ts
import type {
  DailyRevenue,
  RevenueSummaryRepository,
} from '@/modules/orders/application/use-cases/get-revenue-summary';
```

Change the class declaration from:

```ts
export class DrizzleOrderRepository
  implements
    OrderRepository,
    CheckoutOrderRepository,
    ConfirmPaymentOrderRepository,
    StaleCheckoutOrderRepository,
    MarkAwaitingConfirmationOrderRepository,
    UpdateOrderNotesRepository,
    ListOrderEventsRepository,
    StuckAwaitingConfirmationOrderRepository,
    OrderFulfillmentRepository,
    PaidOrderLinesRepository,
    OrderSummaryRepository,
    OrderHistoryRepository,
    UnfulfillableOrderLinesRepository,
    CancelOrderRepository
{
```

to:

```ts
export class DrizzleOrderRepository
  implements
    OrderRepository,
    CheckoutOrderRepository,
    ConfirmPaymentOrderRepository,
    StaleCheckoutOrderRepository,
    MarkAwaitingConfirmationOrderRepository,
    UpdateOrderNotesRepository,
    ListOrderEventsRepository,
    StuckAwaitingConfirmationOrderRepository,
    OrderFulfillmentRepository,
    PaidOrderLinesRepository,
    OrderSummaryRepository,
    OrderHistoryRepository,
    UnfulfillableOrderLinesRepository,
    CancelOrderRepository,
    RevenueSummaryRepository
{
```

Add the new method next to `listForOrder` (near the top of the class body):

```ts
  async getDailyRevenue(since: Date, until: Date): Promise<{ currency: string | null; days: DailyRevenue[] }> {
    const rows = await this.db
      .select({
        day: sql<string>`to_char(${orderEvents.createdAt}, 'YYYY-MM-DD')`,
        totalMinor: sql<number>`sum((${orderEvents.metadata}->>'amountMinor')::bigint)`,
        totalQuantity: sql<number>`sum(coalesce((${orderEvents.metadata}->>'quantity')::bigint, 0))`,
        orderCount: sql<number>`count(*)`,
        currency: orders.currency,
      })
      .from(orderEvents)
      .innerJoin(orders, eq(orders.id, orderEvents.orderId))
      .where(
        and(
          eq(orderEvents.eventType, 'order_created'),
          gte(orderEvents.createdAt, since),
          lte(orderEvents.createdAt, until),
        ),
      )
      .groupBy(sql`1`, orders.currency)
      .orderBy(sql`1`);

    const days: DailyRevenue[] = rows.map((r) => ({
      day: r.day,
      totalMinor: Number(r.totalMinor),
      orderCount: Number(r.orderCount),
      totalQuantity: Number(r.totalQuantity),
    }));
    return { currency: rows[0]?.currency ?? null, days };
  }
```

(`orderEvents` and `orders` are already imported in this file from Task 4's predecessor work — no new schema import needed.)

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/orders/application/use-cases/get-revenue-summary.ts src/modules/orders/application/use-cases/get-revenue-summary.test.ts src/modules/orders/infrastructure/drizzle-order-repository.ts
git commit -m "feat(analytics): add GetRevenueSummary use case for the revenue chart"
```

---

### Task 9: Wire `GetRevenueSummary` into the container

**Files:**
- Modify: `src/composition/container.ts`

**Interfaces:**
- Consumes: `GetRevenueSummary` (Task 8), `DrizzleOrderRepository` (already instantiated as `orders` in this file)
- Produces: `getContainer().getRevenueSummary: GetRevenueSummary`, consumed by Task 16 (main dashboard page).

- [ ] **Step 1: Add the import**

Near the other `orders/application/use-cases` imports (next to `ListOrderEvents`), add:

```ts
import { GetRevenueSummary } from '@/modules/orders/application/use-cases/get-revenue-summary';
```

- [ ] **Step 2: Add to the `Container` interface**

Find:

```ts
  orders: DrizzleOrderRepository;
  paymentStore: DrizzleBitcoinPaymentStore;
  getOnChainActivityReport: GetOnChainActivityReport;
```

Change to:

```ts
  orders: DrizzleOrderRepository;
  paymentStore: DrizzleBitcoinPaymentStore;
  getOnChainActivityReport: GetOnChainActivityReport;
  getRevenueSummary: GetRevenueSummary;
```

- [ ] **Step 3: Instantiate it in `build()`**

Find the line `const orders = new DrizzleOrderRepository(db);` and add immediately after it:

```ts
  const orders = new DrizzleOrderRepository(db);
  const getRevenueSummary = new GetRevenueSummary(orders);
```

- [ ] **Step 4: Add it to the returned object**

Find:

```ts
    orders,
    paymentStore,
    getOnChainActivityReport,
  };
```

Change to:

```ts
    orders,
    paymentStore,
    getOnChainActivityReport,
    getRevenueSummary,
  };
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/composition/container.ts
git commit -m "feat(analytics): wire GetRevenueSummary into the container"
```

---

### Task 10: `chart-tooltip-math` — pure %-change calculation

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/chart-tooltip-math.ts`
- Test: `src/app/(admin)/admin/analytics/components/chart-tooltip-math.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export interface ChartPoint { label: string; value: number; previousValue: number | null; }
  export function percentChange(current: number, previous: number | null): number | null;
  export function withPreviousValue(points: { label: string; value: number }[]): ChartPoint[];
  ```
  Task 11 (`ChartTooltip`) and Tasks 12-14 (the three chart components) consume both functions.

- [ ] **Step 1: Write the failing test**

Create `src/app/(admin)/admin/analytics/components/chart-tooltip-math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { percentChange, withPreviousValue } from './chart-tooltip-math';

describe('percentChange', () => {
  it('returns null when there is no previous point', () => {
    expect(percentChange(100, null)).toBeNull();
  });

  it('returns null when the previous value is zero (undefined ratio)', () => {
    expect(percentChange(100, 0)).toBeNull();
  });

  it('computes a positive percent change, rounded to the nearest integer', () => {
    expect(percentChange(118, 100)).toBe(18);
  });

  it('computes a negative percent change', () => {
    expect(percentChange(80, 100)).toBe(-20);
  });

  it('returns 0 for no change', () => {
    expect(percentChange(100, 100)).toBe(0);
  });
});

describe('withPreviousValue', () => {
  it('attaches null as the previous value for the first point', () => {
    const result = withPreviousValue([{ label: '2026-01-01', value: 5 }]);
    expect(result).toEqual([{ label: '2026-01-01', value: 5, previousValue: null }]);
  });

  it('attaches the prior point\'s value for every subsequent point', () => {
    const result = withPreviousValue([
      { label: '2026-01-01', value: 5 },
      { label: '2026-01-02', value: 8 },
      { label: '2026-01-03', value: 3 },
    ]);
    expect(result).toEqual([
      { label: '2026-01-01', value: 5, previousValue: null },
      { label: '2026-01-02', value: 8, previousValue: 5 },
      { label: '2026-01-03', value: 3, previousValue: 8 },
    ]);
  });

  it('returns an empty array for an empty input', () => {
    expect(withPreviousValue([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/(admin)/admin/analytics/components/chart-tooltip-math.test.ts"`
Expected: FAIL — `chart-tooltip-math.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/app/(admin)/admin/analytics/components/chart-tooltip-math.ts`:

```ts
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
    previousValue: i === 0 ? null : points[i - 1].value,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/(admin)/admin/analytics/components/chart-tooltip-math.test.ts"`
Expected: PASS, all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/analytics/components/chart-tooltip-math.ts" "src/app/(admin)/admin/analytics/components/chart-tooltip-math.test.ts"
git commit -m "feat(analytics): add chart-tooltip-math pure helpers"
```

---

### Task 11: `recharts` dependency + `ChartTooltip` component

**Files:**
- Modify: `package.json` / `package-lock.json` (via `npm install`)
- Create: `src/app/(admin)/admin/analytics/components/ChartTooltip.tsx`
- Create: `src/app/(admin)/admin/analytics/components/ChartTooltip.module.css`

**Interfaces:**
- Consumes: `percentChange` (Task 10), `ChartPoint` (Task 10), `recharts`'s `TooltipProps` type
- Produces: `export function createChartTooltip(valueFormatter: (value: number) => string): FC<TooltipProps<number, string>>`, consumed by Tasks 12-14.

No unit test for this task — it's a presentational React component with no pure logic of its own beyond what Task 10 already tested; this repo has no component-testing infra (see Global Constraints). Verified via typecheck + manual browser check once Task 16 wires it into the page.

- [ ] **Step 1: Install `recharts`**

Run: `npm install recharts`
Expected: `recharts` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the component**

Create `src/app/(admin)/admin/analytics/components/ChartTooltip.module.css`:

```css
.tooltip {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  font-size: 0.8125rem;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
}

.label {
  color: var(--color-muted);
  margin-bottom: var(--space-1);
}

.value {
  font-weight: 600;
}

.changeUp {
  color: var(--color-success);
}

.changeDown {
  color: var(--color-danger);
}
```

Create `src/app/(admin)/admin/analytics/components/ChartTooltip.tsx`:

```tsx
'use client';

import type { TooltipProps } from 'recharts';

import { percentChange, type ChartPoint } from './chart-tooltip-math';
import styles from './ChartTooltip.module.css';

/** Builds a Recharts `<Tooltip content={...}>` renderer for one chart.
 * `valueFormatter` lets each chart display its own unit (views, currency,
 * BTC) while sharing the same layout and %-change-vs-previous-point
 * logic. */
export function createChartTooltip(valueFormatter: (value: number) => string) {
  return function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0]?.payload as ChartPoint | undefined;
    if (!point) return null;

    const change = percentChange(point.value, point.previousValue);

    return (
      <div className={styles.tooltip}>
        <p className={styles.label}>{point.label}</p>
        <p className={styles.value}>{valueFormatter(point.value)}</p>
        {change !== null && (
          <p className={change >= 0 ? styles.changeUp : styles.changeDown}>
            {change >= 0 ? '+' : ''}
            {change}% vs previous
          </p>
        )}
      </div>
    );
  };
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json "src/app/(admin)/admin/analytics/components/ChartTooltip.tsx" "src/app/(admin)/admin/analytics/components/ChartTooltip.module.css"
git commit -m "feat(analytics): add recharts and the shared ChartTooltip component"
```

---

### Task 12: `DailyBarChart` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/DailyBarChart.tsx`

**Interfaces:**
- Consumes: `DailyCount` (`@/modules/analytics/application/ports/analytics-event-repository`), `withPreviousValue`/`createChartTooltip` (Tasks 10-11)
- Produces: `export function DailyBarChart(props: { data: DailyCount[]; label: string }): JSX.Element`, consumed by Task 16 for page-views-per-day and cart-changes-per-day.

- [ ] **Step 1: Write the component**

Create `src/app/(admin)/admin/analytics/components/DailyBarChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import type { DailyCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';

export interface DailyBarChartProps {
  data: DailyCount[];
  /** Unit label shown in the tooltip, e.g. "views", "cart changes". */
  label: string;
}

export function DailyBarChart({ data, label }: DailyBarChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.count })));
  const tooltip = createChartTooltip((value) => `${value} ${label}`);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/analytics/components/DailyBarChart.tsx"
git commit -m "feat(analytics): add DailyBarChart component"
```

---

### Task 13: `RevenueChart` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/RevenueChart.tsx`

**Interfaces:**
- Consumes: `DailyRevenue` (Task 8), `Money` (`@/shared/domain/money`), `withPreviousValue`/`createChartTooltip` (Tasks 10-11)
- Produces: `export function RevenueChart(props: { data: DailyRevenue[]; currency: string }): JSX.Element`, consumed by Task 16.

- [ ] **Step 1: Write the component**

Create `src/app/(admin)/admin/analytics/components/RevenueChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { Money } from '@/shared/domain/money';
import type { DailyRevenue } from '@/modules/orders/application/use-cases/get-revenue-summary';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';

export interface RevenueChartProps {
  data: DailyRevenue[];
  currency: string;
}

export function RevenueChart({ data, currency }: RevenueChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.totalMinor })));
  const format = (value: number) => Money.of(value, currency).toDisplayString();
  const tooltip = createChartTooltip(format);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/analytics/components/RevenueChart.tsx"
git commit -m "feat(analytics): add RevenueChart component"
```

---

### Task 14: `OnChainChart` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/OnChainChart.tsx`

**Interfaces:**
- Consumes: `DailySats` (Task 7), `satsToBtcString` (`@/modules/payments/domain/bip21`, already used elsewhere in this codebase), `withPreviousValue`/`createChartTooltip` (Tasks 10-11)
- Produces: `export function OnChainChart(props: { data: DailySats[] }): JSX.Element`, consumed by Task 16.

- [ ] **Step 1: Write the component**

Create `src/app/(admin)/admin/analytics/components/OnChainChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { DailySats } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';

export interface OnChainChartProps {
  data: DailySats[];
}

const BITCOIN_ORANGE = '#f7931a';

export function OnChainChart({ data }: OnChainChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.sats })));
  const format = (value: number) => `${satsToBtcString(value)} BTC`;
  const tooltip = createChartTooltip(format);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={BITCOIN_ORANGE} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/analytics/components/OnChainChart.tsx"
git commit -m "feat(analytics): add OnChainChart component"
```

---

### Task 15: `DateRangePicker` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/DateRangePicker.tsx`
- Create: `src/app/(admin)/admin/analytics/components/DateRangePicker.module.css`

**Interfaces:**
- Consumes: `Field`, `Input`, `Button` (existing `@/components/ui/*`, all server-safe with no `'use client'` requirement)
- Produces: `export function DateRangePicker(props: { since: Date; until: Date; action: string }): JSX.Element`, consumed by Task 16.

- [ ] **Step 1: Write the component**

Create `src/app/(admin)/admin/analytics/components/DateRangePicker.module.css`:

```css
.form {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.submit {
  margin-bottom: 2px;
}
```

Create `src/app/(admin)/admin/analytics/components/DateRangePicker.tsx`:

```tsx
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import styles from './DateRangePicker.module.css';

export interface DateRangePickerProps {
  since: Date;
  until: Date;
  /** The page path to GET back to with updated `from`/`to` params. */
  action: string;
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Plain GET form, no client JS — matches the products page's
 * searchParams-driven filtering. Submitting re-renders the page (a
 * Server Component) with new `from`/`to` query params. */
export function DateRangePicker({ since, until, action }: DateRangePickerProps) {
  return (
    <form action={action} method="get" className={styles.form}>
      <Field label="From" htmlFor="analytics-date-from">
        <Input type="date" id="analytics-date-from" name="from" defaultValue={toDateInputValue(since)} />
      </Field>
      <Field label="To" htmlFor="analytics-date-to">
        <Input type="date" id="analytics-date-to" name="to" defaultValue={toDateInputValue(until)} />
      </Field>
      <Button type="submit" variant="secondary" className={styles.submit}>
        Apply
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/admin/analytics/components/DateRangePicker.tsx" "src/app/(admin)/admin/analytics/components/DateRangePicker.module.css"
git commit -m "feat(analytics): add DateRangePicker component"
```

---

### Task 16: Wire everything into the main `/admin/analytics` dashboard

**Files:**
- Modify: `src/app/(admin)/admin/analytics/page.tsx`
- Modify: `src/app/(admin)/admin/analytics/page.module.css`

**Interfaces:**
- Consumes: `parseDateRange` (Task 5), `getContainer().getWebAnalyticsSummary`/`getOnChainActivityReport`/`getRevenueSummary` (Tasks 6, 7, 9), `DateRangePicker`/`DailyBarChart`/`RevenueChart`/`OnChainChart` (Tasks 12-15)
- Produces: the updated page itself — this is the last task in Phase 1's dependency chain, nothing later in this plan consumes it. Phase 2's four pages will link back to `/admin/analytics` and reuse the same `parseDateRange` + chart components.

- [ ] **Step 1: Add new CSS classes**

In `src/app/(admin)/admin/analytics/page.module.css`, add at the end of the file:

```css
.sectionHeaderRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.chartCard {
  margin-bottom: var(--space-4);
}
```

- [ ] **Step 2: Rewrite the page**

Replace `src/app/(admin)/admin/analytics/page.tsx` entirely:

```tsx
import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import { parseDateRange, type DateRangeSearchParams } from './date-range';
import { DateRangePicker } from './components/DateRangePicker';
import { DailyBarChart } from './components/DailyBarChart';
import { RevenueChart } from './components/RevenueChart';
import { OnChainChart } from './components/OnChainChart';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminAnalyticsPageProps {
  searchParams: Promise<DateRangeSearchParams>;
}

function ValueCountList({ items, emptyLabel }: { items: ValueCount[]; emptyLabel: string }) {
  if (items.length === 0) return <p className={styles.empty}>{emptyLabel}</p>;
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.value} className={styles.listRow}>
          <span className={styles.listValue}>{item.value}</span>
          <span>{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  await requireAdmin();
  const { since, until } = parseDateRange(await searchParams);

  const { getWebAnalyticsSummary, getOnChainActivityReport, getRevenueSummary } = getContainer();
  const [web, onChain, revenue] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    getOnChainActivityReport.execute({ since, until }),
    getRevenueSummary.execute({ since, until }),
  ]);

  return (
    <PageContainer>
      <Stack gap={5}>
        <div>
          <h1>Analytics</h1>
          <DateRangePicker since={since} until={until} action="/admin/analytics" />
        </div>

        <section>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Page views</h2>
            <Link href="/admin/analytics/page-views">View details →</Link>
          </div>
          <Card className={styles.chartCard}>
            <h3 className={styles.cardTitle}>Page views per day</h3>
            {web.pageViewsPerDay.length === 0 ? (
              <p className={styles.empty}>No data yet.</p>
            ) : (
              <DailyBarChart data={web.pageViewsPerDay} label="views" />
            )}
          </Card>
          <div className={styles.grid}>
            <Card>
              <h3 className={styles.cardTitle}>Top pages</h3>
              <ValueCountList items={web.topPaths} emptyLabel="No page views yet." />
            </Card>
            <Card>
              <h3 className={styles.cardTitle}>Top referrers</h3>
              <ValueCountList items={web.topReferrers} emptyLabel="No referrer data yet." />
            </Card>
          </div>
        </section>

        <section>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Searches</h2>
            <Link href="/admin/analytics/searches">View details →</Link>
          </div>
          <Card>
            <h3 className={styles.cardTitle}>Top search terms</h3>
            <ValueCountList items={web.topSearchTerms} emptyLabel="No searches yet." />
          </Card>
        </section>

        <section>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Cart activity</h2>
            <Link href="/admin/analytics/cart">View details →</Link>
          </div>
          <Card className={styles.chartCard}>
            <h3 className={styles.cardTitle}>Cart changes per day</h3>
            {web.cartChangesPerDay.length === 0 ? (
              <p className={styles.empty}>No data yet.</p>
            ) : (
              <DailyBarChart data={web.cartChangesPerDay} label="cart changes" />
            )}
          </Card>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Revenue</h2>
          <Card className={styles.chartCard}>
            <h3 className={styles.cardTitle}>Revenue per day</h3>
            {revenue.days.length === 0 ? (
              <p className={styles.empty}>No orders yet.</p>
            ) : (
              <RevenueChart data={revenue.days} currency={revenue.currency} />
            )}
          </Card>
        </section>

        <section>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>On-chain activity</h2>
            <Link href="/admin/analytics/on-chain">View details →</Link>
          </div>
          <p className={styles.meta}>
            Totals use each order&apos;s expected amount as a stand-in for actually-received
            sats (accurate in the common exact-payment case) — underpaid/overpaid orders are
            flagged below rather than silently folded into the total.
          </p>
          <div className={styles.summaryRow}>
            <Card className={styles.summaryCard}>
              <p className={styles.bigNumber}>{satsToBtcString(onChain.totalSats)} BTC</p>
              <p className={styles.cardLabel}>Total received (proxy)</p>
            </Card>
            <Card className={styles.summaryCard}>
              <p className={styles.bigNumber}>{onChain.addressCount}</p>
              <p className={styles.cardLabel}>Distinct addresses</p>
            </Card>
          </div>
          <Card className={styles.chartCard}>
            <h3 className={styles.cardTitle}>Sats received per day</h3>
            {onChain.satsPerDay.length === 0 ? (
              <p className={styles.empty}>No data yet.</p>
            ) : (
              <OnChainChart data={onChain.satsPerDay} />
            )}
          </Card>

          <Card>
            <h3 className={styles.cardTitle}>Paid orders</h3>
            {onChain.orders.length === 0 ? (
              <p className={styles.empty}>No paid orders in this window.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Address</th>
                      <th>Amount</th>
                      <th>Confirmations</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onChain.orders.map((o) => (
                      <tr key={o.orderId}>
                        <td>
                          <Link href={`/admin/orders/${o.orderId}`}>{o.orderId.slice(0, 8)}</Link>
                        </td>
                        <td>{o.address}</td>
                        <td>{satsToBtcString(o.expectedSats)} BTC</td>
                        <td>{o.confirmations}</td>
                        <td>
                          {o.underpaid && <Badge tone="danger">Underpaid</Badge>}
                          {o.overpaid && <Badge tone="warning">Overpaid</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </Stack>
    </PageContainer>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: no errors, all tests pass, build succeeds.

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`, sign in as an admin, visit `/admin/analytics`. Confirm: the date picker shows the last 30 days by default and re-renders the page with new data when changed; all 5 sections render (Page views, Searches, Cart activity, Revenue, On-chain activity) each with a chart or an appropriate empty state; hovering a chart bar shows the tooltip with its value and %-change (or no %-change line on the first bar); each "View details →" link is present (they'll 404 until Phase 2 builds those pages — that's expected at this point).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/analytics/page.tsx" "src/app/(admin)/admin/analytics/page.module.css"
git commit -m "feat(analytics): wire charts, date range, and revenue into the main dashboard"
```

---

### Task 17: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full verification sweep**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all four commands succeed with no errors.

- [ ] **Step 2: Confirm git state**

Run: `git status --short`
Expected: clean (everything from Tasks 1-16 already committed).

- [ ] **Step 3: Report**

Phase 1 is complete: the 3 tracking gaps are closed, `/admin/analytics` has a custom date range, 4 charts with %-change tooltips, and links out to the 4 Phase 2 pages. Phase 2 (the dedicated `page-views`/`searches`/`cart`/`on-chain` pages, the per-user timeline, and CSV export) gets its own plan once this lands.
