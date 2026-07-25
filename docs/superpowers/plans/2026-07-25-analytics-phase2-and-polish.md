# Analytics Phase 2: Dashboard Polish + Drill-Down Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `/admin/analytics` dashboard's presentation layer (StatCard/DataTable/ChartCard/shared chart theming, no new dependency) and build the deferred Phase 2 pages — `/admin/analytics/page-views`, `/searches`, `/cart`, `/on-chain`, `/users` — plus CSV export, on the improved components.

**Architecture:** Clean Architecture, unchanged from the rest of the repo — domain has no infra imports, use cases depend on ports, `src/app/**` calls use cases only via `getContainer()`. New presentation components are colocated under `src/app/(admin)/admin/analytics/components/` and are pure presentation (no business logic). Two new use cases (`ListAnalyticsEvents`, `GetEventsForIdentity`) back the new pages' raw-event tables and CSV export.

**Tech Stack:** Next.js App Router, TypeScript strict, Drizzle ORM, PostgreSQL, Vitest, `recharts` (already a dependency — no new one added).

## Global Constraints

- Money: never floats, always through the `Money` value object with an explicit currency (`CLAUDE.md`).
- `src/app/**` calls use cases only — never repositories or the DB client directly.
- Ports live in `application/ports`; implementations in `infrastructure`. Use cases depend on the port.
- Domain/use-case tests must run without a database or network (this repo has no jsdom/component-testing infra — don't add any).
- Files: `kebab-case.ts`. Classes/types: `PascalCase`. Use cases: verb-first.
- Wire every new use case in `src/composition/container.ts` — never `new` an adapter inside a use case.
- No third-party UI/dashboard library — stays on the existing CSS-Modules + `--color-*`/`--space-*` CSS-variable design system.
- Every step that touches code must leave `npm run typecheck`, `npm run lint`, and `npm test` passing before its commit.

---

### Task 1: `chart-theme.ts` + retrofit the 3 existing chart components

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/chart-theme.ts`
- Modify: `src/app/(admin)/admin/analytics/components/DailyBarChart.tsx`
- Modify: `src/app/(admin)/admin/analytics/components/RevenueChart.tsx`
- Modify: `src/app/(admin)/admin/analytics/components/OnChainChart.tsx`

**Interfaces:**
- Consumes: nothing new — `recharts`' `CartesianGrid` (already installed).
- Produces: `CHART_COLORS: { accent: string; success: string; bitcoin: string }`, `CHART_GRID_STROKE: string`, `CHART_TICK_STYLE: { fontSize: number }` — used by every chart component from here on, including Task 18-20's new pages.

This is a pure refactor (no behavior change) — no test needed, matches the existing precedent that chart components (JSX/presentational) aren't unit tested in this repo.

- [ ] **Step 1: Create the shared theme module**

Create `src/app/(admin)/admin/analytics/components/chart-theme.ts`:

```ts
/** Shared Recharts styling so every chart in this section renders
 * consistently instead of each hand-tuning its own colors/gridlines. */
export const CHART_COLORS = {
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  bitcoin: '#f7931a',
} as const;

export const CHART_GRID_STROKE = 'var(--color-border)';

export const CHART_TICK_STYLE = { fontSize: 12 } as const;
```

- [ ] **Step 2: Retrofit `DailyBarChart.tsx`**

Replace the full contents of `src/app/(admin)/admin/analytics/components/DailyBarChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import type { DailyCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';
import { CHART_COLORS, CHART_GRID_STROKE, CHART_TICK_STYLE } from './chart-theme';

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
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
        <YAxis allowDecimals={false} tick={CHART_TICK_STYLE} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Retrofit `RevenueChart.tsx`**

Replace the full contents of `src/app/(admin)/admin/analytics/components/RevenueChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { Money } from '@/shared/domain/money';
import type { DailyRevenue } from '@/modules/orders/application/use-cases/get-revenue-summary';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';
import { CHART_COLORS, CHART_GRID_STROKE, CHART_TICK_STYLE } from './chart-theme';

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
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
        <YAxis allowDecimals={false} tick={CHART_TICK_STYLE} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Retrofit `OnChainChart.tsx`**

Replace the full contents of `src/app/(admin)/admin/analytics/components/OnChainChart.tsx`:

```tsx
'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { DailySats } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import { withPreviousValue } from './chart-tooltip-math';
import { createChartTooltip } from './ChartTooltip';
import { CHART_COLORS, CHART_GRID_STROKE, CHART_TICK_STYLE } from './chart-theme';

export interface OnChainChartProps {
  data: DailySats[];
}

export function OnChainChart({ data }: OnChainChartProps) {
  const points = withPreviousValue(data.map((d) => ({ label: d.day, value: d.sats })));
  const format = (value: number) => `${satsToBtcString(value)} BTC`;
  const tooltip = createChartTooltip(format);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={points}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
        <YAxis allowDecimals={false} tick={CHART_TICK_STYLE} tickFormatter={format} />
        <RechartsTooltip content={tooltip} />
        <Bar dataKey="value" fill={CHART_COLORS.bitcoin} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass (no test changes in this task — pure refactor).

```bash
git add src/app/\(admin\)/admin/analytics/components/chart-theme.ts \
  src/app/\(admin\)/admin/analytics/components/DailyBarChart.tsx \
  src/app/\(admin\)/admin/analytics/components/RevenueChart.tsx \
  src/app/\(admin\)/admin/analytics/components/OnChainChart.tsx
git commit -m "refactor(analytics): shared chart theme + gridlines across all charts"
```

---

### Task 2: `StatCard` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/StatCard.tsx`
- Create: `src/app/(admin)/admin/analytics/components/StatCard.module.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `StatCard({ label: string; value: string })` — used by Task 3's `StatCardRow` and every page from Task 8 onward.

No test — pure presentational component, matches existing precedent (chart components aren't unit tested).

- [ ] **Step 1: Create the component**

Create `src/app/(admin)/admin/analytics/components/StatCard.tsx`:

```tsx
import styles from './StatCard.module.css';

export interface StatCardProps {
  label: string;
  value: string;
}

/** One KPI number: small muted label on top, large bold value below. No
 * %-change — chart tooltips already cover period-over-period comparison;
 * adding it here would require fetching a second date range per page load. */
export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create the CSS module**

Create `src/app/(admin)/admin/analytics/components/StatCard.module.css`:

```css
.card {
  flex: 1 1 160px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  margin-bottom: var(--space-2);
}

.value {
  font-size: 1.5rem;
  font-weight: 600;
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass (new file, unused until Task 3 — typecheck still passes since it's a self-contained, valid module).

```bash
git add src/app/\(admin\)/admin/analytics/components/StatCard.tsx \
  src/app/\(admin\)/admin/analytics/components/StatCard.module.css
git commit -m "feat(analytics): add StatCard component"
```

---

### Task 3: `StatCardRow` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/StatCardRow.tsx`
- Create: `src/app/(admin)/admin/analytics/components/StatCardRow.module.css`

**Interfaces:**
- Consumes: `StatCard` (Task 2) as `children`.
- Produces: `StatCardRow({ children: ReactNode })` — used by every page from Task 8 onward.

- [ ] **Step 1: Create the component**

Create `src/app/(admin)/admin/analytics/components/StatCardRow.tsx`:

```tsx
import type { ReactNode } from 'react';

import styles from './StatCardRow.module.css';

/** Responsive row of `StatCard`s — wraps to multiple rows on narrow
 * viewports instead of overflowing or squeezing. */
export function StatCardRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
```

- [ ] **Step 2: Create the CSS module**

Create `src/app/(admin)/admin/analytics/components/StatCardRow.module.css`:

```css
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add src/app/\(admin\)/admin/analytics/components/StatCardRow.tsx \
  src/app/\(admin\)/admin/analytics/components/StatCardRow.module.css
git commit -m "feat(analytics): add StatCardRow component"
```

---

### Task 4: `DataTable` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/DataTable.tsx`
- Create: `src/app/(admin)/admin/analytics/components/DataTable.module.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `DataTable<T>({ columns: DataTableColumn<T>[]; rows: T[]; rowKey: (row: T) => string; emptyLabel: string })` where `DataTableColumn<T> = { key: string; header: string; render: (row: T) => ReactNode }` — used by Task 8's dashboard retrofit and every new page from Task 18 onward.

- [ ] **Step 1: Create the component**

Create `src/app/(admin)/admin/analytics/components/DataTable.tsx`:

```tsx
import type { ReactNode } from 'react';

import styles from './DataTable.module.css';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel: string;
}

/** Generic styled table — zebra striping, hover highlight, consistent
 * header treatment — or the empty-state paragraph when `rows` is empty.
 * Replaces the ad hoc `<ul>`/`<table>` markup previously duplicated per
 * list/table on the analytics pages. */
export function DataTable<T>({ columns, rows, rowKey, emptyLabel }: DataTableProps<T>) {
  if (rows.length === 0) return <p className={styles.empty}>{emptyLabel}</p>;

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the CSS module**

Create `src/app/(admin)/admin/analytics/components/DataTable.module.css`:

```css
.empty {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.table th {
  text-align: left;
  color: var(--color-muted);
  font-weight: 500;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table tbody tr:nth-child(even) td {
  background: var(--color-surface);
}

.table tbody tr:hover td {
  background: var(--color-border);
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add src/app/\(admin\)/admin/analytics/components/DataTable.tsx \
  src/app/\(admin\)/admin/analytics/components/DataTable.module.css
git commit -m "feat(analytics): add DataTable component"
```

---

### Task 5: `ChartCard` component

**Files:**
- Create: `src/app/(admin)/admin/analytics/components/ChartCard.tsx`
- Create: `src/app/(admin)/admin/analytics/components/ChartCard.module.css`

**Interfaces:**
- Consumes: `Card` from `@/components/ui/Card`.
- Produces: `ChartCard({ title: string; children: ReactNode })` — used by Task 8's dashboard retrofit and every new page from Task 18 onward.

- [ ] **Step 1: Create the component**

Create `src/app/(admin)/admin/analytics/components/ChartCard.tsx`:

```tsx
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import styles from './ChartCard.module.css';

export interface ChartCardProps {
  title: string;
  children: ReactNode;
}

/** Wraps a chart in the `Card` + title treatment previously copy-pasted as
 * `<Card className={styles.chartCard}><h3 className={styles.cardTitle}>`
 * everywhere a chart appeared. */
export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {children}
    </Card>
  );
}
```

- [ ] **Step 2: Create the CSS module**

Create `src/app/(admin)/admin/analytics/components/ChartCard.module.css`:

```css
.card {
  margin-bottom: var(--space-4);
}

.title {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: var(--space-3);
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add src/app/\(admin\)/admin/analytics/components/ChartCard.tsx \
  src/app/\(admin\)/admin/analytics/components/ChartCard.module.css
git commit -m "feat(analytics): add ChartCard component"
```

---

### Task 6: `searchesPerDay` on `GetWebAnalyticsSummary`

**Files:**
- Modify: `src/modules/analytics/application/use-cases/get-web-analytics-summary.ts`
- Modify: `src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEventRepository.countByTypePerDay('search', since, until)` — already exists, `'search'` is already a valid `AnalyticsEventType`. No port change needed.
- Produces: `GetWebAnalyticsSummaryResult.searchesPerDay: DailyCount[]` — consumed by Task 8's dashboard retrofit and Task 19's `/searches` page.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { GetWebAnalyticsSummary } from './get-web-analytics-summary';
import type { AnalyticsEventRepository, DailyCount, ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';

describe('GetWebAnalyticsSummary', () => {
  it('aggregates page views, searches, cart changes, top paths, top referrers, and top search terms', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const pageViewsPerDay: DailyCount[] = [{ day: '2026-01-01', count: 5 }];
    const searchesPerDay: DailyCount[] = [{ day: '2026-01-01', count: 1 }];
    const cartChangesPerDay: DailyCount[] = [{ day: '2026-01-01', count: 2 }];
    const topPaths: ValueCount[] = [{ value: '/products', count: 5 }];
    const topReferrers: ValueCount[] = [{ value: 'https://google.com', count: 3 }];
    const topSearchTerms: ValueCount[] = [{ value: 'test', count: 2 }];

    // Cast (not a direct typed literal) deliberately: Task 9 (later in this
    // plan) adds `listByType`/`listBySessionId` to `AnalyticsEventRepository`.
    // A plain `const repo: AnalyticsEventRepository = {...}` would fail
    // TypeScript's excess-property check right now, before Task 9 lands —
    // `as` sidesteps that check and stays valid once Task 9 does land, since
    // the object is a structurally complete `AnalyticsEventRepository`
    // either way.
    const repo = {
      async record() {},
      async countByTypePerDay(eventType, s, u) {
        expect(s).toBe(since);
        expect(u).toBe(until);
        if (eventType === 'page_view') return pageViewsPerDay;
        if (eventType === 'search') return searchesPerDay;
        return cartChangesPerDay;
      },
      async topValues(eventType, field) {
        expect(eventType).toBe('page_view');
        return field === 'path' ? topPaths : topReferrers;
      },
      async topSearchTerms() {
        return topSearchTerms;
      },
      async listByType() {
        throw new Error('not used by this use case');
      },
      async listBySessionId() {
        throw new Error('not used by this use case');
      },
    } as AnalyticsEventRepository;

    const result = await new GetWebAnalyticsSummary(repo).execute({ since, until });

    expect(result).toEqual({
      pageViewsPerDay,
      searchesPerDay,
      topPaths,
      topReferrers,
      topSearchTerms,
      cartChangesPerDay,
    });
  });
});
```

Note: the mock includes `listByType`/`listBySessionId` stubs even though the port doesn't have them yet at this point in the plan (Task 9 adds them later) — the `as AnalyticsEventRepository` cast (instead of a directly-typed `const repo: AnalyticsEventRepository = {...}`) means TypeScript's excess-property check doesn't reject those two extra methods now, and the object remains a valid `AnalyticsEventRepository` once Task 9 does land, so this test file never needs to be touched again.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts`
Expected: FAIL on the `toEqual` assertion — `result` doesn't include `searchesPerDay` yet.

- [ ] **Step 3: Add `searchesPerDay` to the use case**

Replace the full contents of `src/modules/analytics/application/use-cases/get-web-analytics-summary.ts`:

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
  searchesPerDay: DailyCount[];
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

    const [pageViewsPerDay, searchesPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay] =
      await Promise.all([
        this.events.countByTypePerDay('page_view', since, until),
        this.events.countByTypePerDay('search', since, until),
        this.events.topValues('page_view', 'path', since, until, TOP_LIMIT),
        this.events.topValues('page_view', 'referrer', since, until, TOP_LIMIT),
        this.events.topSearchTerms(since, until, TOP_LIMIT),
        this.events.countByTypePerDay('cart_changed', since, until),
      ]);

    return { pageViewsPerDay, searchesPerDay, topPaths, topReferrers, topSearchTerms, cartChangesPerDay };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts && npm run typecheck`
Expected: both PASS — the `as` cast (see the note above Step 2) keeps this file typecheck-clean regardless of whether Task 9 has landed yet.

- [ ] **Step 5: Commit**

```bash
git add src/modules/analytics/application/use-cases/get-web-analytics-summary.ts \
  src/modules/analytics/application/use-cases/get-web-analytics-summary.test.ts
git commit -m "feat(analytics): add searchesPerDay to GetWebAnalyticsSummary"
```

---

### Task 7: Export `MS_PER_DAY` from `date-range.ts`

**Files:**
- Modify: `src/app/(admin)/admin/analytics/date-range.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MS_PER_DAY: number` (exported) — consumed by Task 8's daily-average StatCard calculation.

No new test — this is a one-line visibility change to an already-tested constant; `date-range.test.ts`'s existing assertions are unaffected.

- [ ] **Step 1: Export the constant**

In `src/app/(admin)/admin/analytics/date-range.ts`, change:

```ts
const MS_PER_DAY = 24 * 60 * 60 * 1000;
```

to:

```ts
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
```

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npx vitest run src/app/\(admin\)/admin/analytics/date-range.test.ts`
Expected: both pass (no behavior change).

```bash
git add "src/app/(admin)/admin/analytics/date-range.ts"
git commit -m "refactor(analytics): export MS_PER_DAY for reuse in StatCard daily averages"
```

---

### Task 8: Retrofit the main `/admin/analytics` dashboard

**Files:**
- Modify: `src/app/(admin)/admin/analytics/page.tsx`
- Modify: `src/app/(admin)/admin/analytics/page.module.css`

**Interfaces:**
- Consumes: `StatCard` (Task 2), `StatCardRow` (Task 3), `DataTable`/`DataTableColumn` (Task 4), `ChartCard` (Task 5), `MS_PER_DAY` (Task 7), `GetWebAnalyticsSummaryResult.searchesPerDay` (Task 6).
- Produces: nothing new for later tasks — this is the retrofit's terminal consumer.

No test — `page.tsx` is a Server Component page, not unit tested anywhere in this repo (matches existing precedent).

- [ ] **Step 1: Replace `page.tsx`**

Replace the full contents of `src/app/(admin)/admin/analytics/page.tsx`:

```tsx
import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { Money } from '@/shared/domain/money';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { DailyCount, ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import type { OnChainOrderActivity } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import { parseDateRange, MS_PER_DAY, type DateRangeSearchParams } from './date-range';
import { DateRangePicker } from './components/DateRangePicker';
import { DailyBarChart } from './components/DailyBarChart';
import { RevenueChart } from './components/RevenueChart';
import { OnChainChart } from './components/OnChainChart';
import { StatCard } from './components/StatCard';
import { StatCardRow } from './components/StatCardRow';
import { DataTable, type DataTableColumn } from './components/DataTable';
import { ChartCard } from './components/ChartCard';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminAnalyticsPageProps {
  searchParams: Promise<DateRangeSearchParams>;
}

function sum(series: DailyCount[]): number {
  return series.reduce((total, d) => total + d.count, 0);
}

function dailyAverage(total: number, since: Date, until: Date): string {
  const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / MS_PER_DAY));
  return (total / days).toFixed(1);
}

const valueCountColumns: DataTableColumn<ValueCount>[] = [
  { key: 'value', header: 'Value', render: (r) => r.value },
  { key: 'count', header: 'Count', render: (r) => r.count },
];

function ValueCountTable({ items, emptyLabel }: { items: ValueCount[]; emptyLabel: string }) {
  return (
    <DataTable columns={valueCountColumns} rows={items} rowKey={(r) => r.value} emptyLabel={emptyLabel} />
  );
}

const orderActivityColumns: DataTableColumn<OnChainOrderActivity>[] = [
  {
    key: 'order',
    header: 'Order',
    render: (o) => <Link href={`/admin/orders/${o.orderId}`}>{o.orderId.slice(0, 8)}</Link>,
  },
  { key: 'address', header: 'Address', render: (o) => o.address },
  { key: 'amount', header: 'Amount', render: (o) => `${satsToBtcString(o.expectedSats)} BTC` },
  { key: 'confirmations', header: 'Confirmations', render: (o) => o.confirmations },
  {
    key: 'flags',
    header: 'Flags',
    render: (o) => (
      <>
        {o.underpaid && <Badge tone="danger">Underpaid</Badge>}
        {o.overpaid && <Badge tone="warning">Overpaid</Badge>}
      </>
    ),
  },
];

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  await requireAdmin();
  const { since, until } = parseDateRange(await searchParams);

  const { getWebAnalyticsSummary, getOnChainActivityReport, getRevenueSummary } = getContainer();
  const [web, onChain, revenue] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    getOnChainActivityReport.execute({ since, until }),
    getRevenueSummary.execute({ since, until }),
  ]);

  const totalViews = sum(web.pageViewsPerDay);
  const totalSearches = sum(web.searchesPerDay);
  const totalCartChanges = sum(web.cartChangesPerDay);
  const totalRevenueMinor = revenue.days.reduce((total, d) => total + d.totalMinor, 0);
  const totalItemsSold = revenue.days.reduce((total, d) => total + d.totalQuantity, 0);

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
          <StatCardRow>
            <StatCard label="Total views" value={String(totalViews)} />
            <StatCard label="Daily average" value={dailyAverage(totalViews, since, until)} />
          </StatCardRow>
          <ChartCard title="Page views per day">
            {web.pageViewsPerDay.length === 0 ? (
              <p className={styles.empty}>No data yet.</p>
            ) : (
              <DailyBarChart data={web.pageViewsPerDay} label="views" />
            )}
          </ChartCard>
          <div className={styles.grid}>
            <Card>
              <h3 className={styles.cardTitle}>Top pages</h3>
              <ValueCountTable items={web.topPaths} emptyLabel="No page views yet." />
            </Card>
            <Card>
              <h3 className={styles.cardTitle}>Top referrers</h3>
              <ValueCountTable items={web.topReferrers} emptyLabel="No referrer data yet." />
            </Card>
          </div>
        </section>

        <section>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Searches</h2>
            <Link href="/admin/analytics/searches">View details →</Link>
          </div>
          <StatCardRow>
            <StatCard label="Total searches" value={String(totalSearches)} />
            <StatCard label="Daily average" value={dailyAverage(totalSearches, since, until)} />
          </StatCardRow>
          <ChartCard title="Searches per day">
            {web.searchesPerDay.length === 0 ? (
              <p className={styles.empty}>No data yet.</p>
            ) : (
              <DailyBarChart data={web.searchesPerDay} label="searches" />
            )}
          </ChartCard>
          <Card>
            <h3 className={styles.cardTitle}>Top search terms</h3>
            <ValueCountTable items={web.topSearchTerms} emptyLabel="No searches yet." />
          </Card>
        </section>

        <section>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Cart activity</h2>
            <Link href="/admin/analytics/cart">View details →</Link>
          </div>
          <StatCardRow>
            <StatCard label="Total cart changes" value={String(totalCartChanges)} />
            <StatCard label="Daily average" value={dailyAverage(totalCartChanges, since, until)} />
          </StatCardRow>
          <ChartCard title="Cart changes per day">
            {web.cartChangesPerDay.length === 0 ? (
              <p className={styles.empty}>No data yet.</p>
            ) : (
              <DailyBarChart data={web.cartChangesPerDay} label="cart changes" />
            )}
          </ChartCard>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Revenue</h2>
          <StatCardRow>
            <StatCard label="Total revenue" value={Money.of(totalRevenueMinor, revenue.currency).toDisplayString()} />
            <StatCard label="Items sold" value={String(totalItemsSold)} />
          </StatCardRow>
          <ChartCard title="Revenue per day">
            {revenue.days.length === 0 ? (
              <p className={styles.empty}>No orders yet.</p>
            ) : (
              <RevenueChart data={revenue.days} currency={revenue.currency} />
            )}
          </ChartCard>
          <ChartCard title="Items sold per day">
            {revenue.days.length === 0 ? (
              <p className={styles.empty}>No orders yet.</p>
            ) : (
              <DailyBarChart
                data={revenue.days.map((d) => ({ day: d.day, count: d.totalQuantity }))}
                label="items"
              />
            )}
          </ChartCard>
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
          <StatCardRow>
            <StatCard label="Total received (proxy)" value={`${satsToBtcString(onChain.totalSats)} BTC`} />
            <StatCard label="Distinct addresses" value={String(onChain.addressCount)} />
          </StatCardRow>
          <ChartCard title="Sats received per day">
            {onChain.satsPerDay.length === 0 ? (
              <p className={styles.empty}>No data yet.</p>
            ) : (
              <OnChainChart data={onChain.satsPerDay} />
            )}
          </ChartCard>

          <Card>
            <h3 className={styles.cardTitle}>Paid orders</h3>
            <DataTable
              columns={orderActivityColumns}
              rows={onChain.orders}
              rowKey={(o) => o.orderId}
              emptyLabel="No paid orders in this window."
            />
          </Card>
        </section>
      </Stack>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Trim `page.module.css`**

Replace the full contents of `src/app/(admin)/admin/analytics/page.module.css` — the `.summaryRow`/`.summaryCard`/`.bigNumber`/`.cardLabel`/`.tableWrap`/`.table`/`.chartCard`/`.list`/`.listRow`/`.listValue` classes are now dead (replaced by `StatCard`/`StatCardRow`/`DataTable`/`ChartCard`'s own CSS modules):

```css
.meta {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.sectionTitle {
  font-size: 1.125rem;
  margin-bottom: var(--space-3);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
}

.cardTitle {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: var(--space-3);
}

.empty {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.sectionHeaderRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
```

- [ ] **Step 3: Verify manually and in CI**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all pass. Then start the dev server (`npm run dev`) and visit `/admin/analytics` as an admin to confirm: every section shows a `StatCardRow`, every chart is inside a `ChartCard`, top-paths/referrers/search-terms and paid-orders render via `DataTable`, and the Searches section now has its own day chart.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/analytics/page.tsx" "src/app/(admin)/admin/analytics/page.module.css"
git commit -m "feat(analytics): retrofit main dashboard onto StatCard/DataTable/ChartCard"
```

---

### Task 9: Extend `AnalyticsEventRepository` port with raw-row listing

**Files:**
- Modify: `src/modules/analytics/application/ports/analytics-event-repository.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AnalyticsEventRow` type, `AnalyticsEventRepository.listByType(eventType, since, until, limit, offset): Promise<{ items: AnalyticsEventRow[]; total: number }>`, `AnalyticsEventRepository.listBySessionId(sessionId, since, until): Promise<AnalyticsEventRow[]>` — implemented by Task 10, consumed by Task 11 (`ListAnalyticsEvents`) and Task 12 (`GetEventsForIdentity`).

This is a port (interface-only) change — no test of its own; Task 10's Drizzle implementation and Tasks 11-12's use-case tests exercise it.

- [ ] **Step 1: Add the row type and two methods**

Replace the full contents of `src/modules/analytics/application/ports/analytics-event-repository.ts`:

```ts
export type AnalyticsEventType = 'page_view' | 'search' | 'cart_changed';

export interface AnalyticsEventInput {
  eventType: AnalyticsEventType;
  sessionId: string | null;
  userId: string | null;
  path?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface ValueCount {
  value: string;
  count: number;
}

/** A raw stored row — backs the per-event-type pages' tables, their CSV
 * export, and the per-identity timeline. */
export interface AnalyticsEventRow {
  id: string;
  eventType: AnalyticsEventType;
  sessionId: string | null;
  userId: string | null;
  path: string | null;
  referrer: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

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
  /** Paginated raw rows for one event type, newest first — backs each
   * per-type page's table and CSV export. */
  listByType(
    eventType: AnalyticsEventType,
    since: Date,
    until: Date,
    limit: number,
    offset: number,
  ): Promise<{ items: AnalyticsEventRow[]; total: number }>;
  /** All web events (any type) for one `sessionId`, chronological
   * (oldest first) — backs the per-identity timeline. Logged-in users
   * always have `sessionId === userId` at write time, so this same
   * column serves both guest and logged-in lookups. */
  listBySessionId(sessionId: string, since: Date, until: Date): Promise<AnalyticsEventRow[]>;
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck 2>&1 | grep "drizzle-analytics-event-repository\|get-web-analytics-summary"`
Expected: an error in `drizzle-analytics-event-repository.ts` — it no longer satisfies the `AnalyticsEventRepository` interface (missing `listByType`/`listBySessionId`). This confirms the port change is wired to the interface correctly; Task 10 fixes the implementation.

- [ ] **Step 3: Commit**

```bash
git add src/modules/analytics/application/ports/analytics-event-repository.ts
git commit -m "feat(analytics): add AnalyticsEventRow + raw-row listing to the port"
```

---

### Task 10: Implement raw-row listing in `DrizzleAnalyticsEventRepository`

**Files:**
- Modify: `src/modules/analytics/infrastructure/drizzle-analytics-event-repository.ts`

**Interfaces:**
- Consumes: `AnalyticsEventRow`, the two new port methods from Task 9.
- Produces: a working `DrizzleAnalyticsEventRepository` — consumed by Task 13's container wiring.

No dedicated test file — this class talks to Postgres directly and this repo's convention is domain/use-case tests only, no DB (matches every other Drizzle repository in this codebase, none of which have their own test file). Tasks 11 and 12's use-case tests exercise the port contract with an in-memory fake instead.

- [ ] **Step 1: Add the two methods**

Replace the full contents of `src/modules/analytics/infrastructure/drizzle-analytics-event-repository.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { DB } from '@/shared/infrastructure/db/client';
import { analyticsEvents } from '@/shared/infrastructure/db/schema';
import type {
  AnalyticsEventInput,
  AnalyticsEventRepository,
  AnalyticsEventRow,
  AnalyticsEventType,
  DailyCount,
  ValueCount,
} from '@/modules/analytics/application/ports/analytics-event-repository';

function toRow(r: typeof analyticsEvents.$inferSelect): AnalyticsEventRow {
  return {
    id: r.id,
    eventType: r.eventType as AnalyticsEventType,
    sessionId: r.sessionId,
    userId: r.userId,
    path: r.path,
    referrer: r.referrer,
    userAgent: r.userAgent,
    ipAddress: r.ipAddress,
    metadata: r.metadata as Record<string, unknown> | null,
    createdAt: r.createdAt,
  };
}

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

  async listByType(
    eventType: AnalyticsEventType,
    since: Date,
    until: Date,
    limit: number,
    offset: number,
  ): Promise<{ items: AnalyticsEventRow[]; total: number }> {
    const whereClause = and(
      eq(analyticsEvents.eventType, eventType),
      gte(analyticsEvents.createdAt, since),
      lte(analyticsEvents.createdAt, until),
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(analyticsEvents)
        .where(whereClause)
        .orderBy(desc(analyticsEvents.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(whereClause),
    ]);

    return { items: rows.map(toRow), total: Number(countRows[0]?.count ?? 0) };
  }

  async listBySessionId(sessionId: string, since: Date, until: Date): Promise<AnalyticsEventRow[]> {
    const rows = await this.db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.sessionId, sessionId),
          gte(analyticsEvents.createdAt, since),
          lte(analyticsEvents.createdAt, until),
        ),
      )
      .orderBy(asc(analyticsEvents.createdAt));
    return rows.map(toRow);
  }
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass — `DrizzleAnalyticsEventRepository` now satisfies `AnalyticsEventRepository` again.

```bash
git add src/modules/analytics/infrastructure/drizzle-analytics-event-repository.ts
git commit -m "feat(analytics): implement listByType and listBySessionId in the Drizzle repo"
```

---

### Task 11: `ListAnalyticsEvents` use case

**Files:**
- Create: `src/modules/analytics/application/use-cases/list-analytics-events.ts`
- Create: `src/modules/analytics/application/use-cases/list-analytics-events.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEventRepository.listByType` (Task 9/10).
- Produces: `ListAnalyticsEvents` — `execute({ eventType, since, until, limit, offset }): Promise<{ items: AnalyticsEventRow[]; total: number }>` — consumed by Task 13's container wiring, Tasks 14-16's export routes, and Tasks 18-20's pages.

- [ ] **Step 1: Write the failing test**

Create `src/modules/analytics/application/use-cases/list-analytics-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ListAnalyticsEvents } from './list-analytics-events';
import type { AnalyticsEventRepository, AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';

function fakeRepo(overrides: Partial<AnalyticsEventRepository> = {}): AnalyticsEventRepository {
  return {
    async record() {},
    async countByTypePerDay() {
      return [];
    },
    async topValues() {
      return [];
    },
    async topSearchTerms() {
      return [];
    },
    async listByType() {
      return { items: [], total: 0 };
    },
    async listBySessionId() {
      return [];
    },
    ...overrides,
  };
}

describe('ListAnalyticsEvents', () => {
  it('passes eventType, since, until, limit, and offset through to the repository', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const items: AnalyticsEventRow[] = [
      {
        id: 'evt-1',
        eventType: 'page_view',
        sessionId: 'sess-1',
        userId: null,
        path: '/products',
        referrer: null,
        userAgent: null,
        ipAddress: null,
        metadata: null,
        createdAt: new Date('2026-01-05'),
      },
    ];

    const repo = fakeRepo({
      async listByType(eventType, s, u, limit, offset) {
        expect(eventType).toBe('page_view');
        expect(s).toBe(since);
        expect(u).toBe(until);
        expect(limit).toBe(25);
        expect(offset).toBe(50);
        return { items, total: 137 };
      },
    });

    const result = await new ListAnalyticsEvents(repo).execute({
      eventType: 'page_view',
      since,
      until,
      limit: 25,
      offset: 50,
    });

    expect(result).toEqual({ items, total: 137 });
  });

  it('returns an empty result when there are no matching rows', async () => {
    const repo = fakeRepo();

    const result = await new ListAnalyticsEvents(repo).execute({
      eventType: 'search',
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
      limit: 25,
      offset: 0,
    });

    expect(result).toEqual({ items: [], total: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/analytics/application/use-cases/list-analytics-events.test.ts`
Expected: FAIL — `list-analytics-events.ts` doesn't exist yet.

- [ ] **Step 3: Write the use case**

Create `src/modules/analytics/application/use-cases/list-analytics-events.ts`:

```ts
import type { UseCase } from '@/shared/application/use-case';
import type {
  AnalyticsEventRepository,
  AnalyticsEventRow,
  AnalyticsEventType,
} from '@/modules/analytics/application/ports/analytics-event-repository';

export interface ListAnalyticsEventsInput {
  eventType: AnalyticsEventType;
  since: Date;
  until: Date;
  limit: number;
  offset: number;
}

export interface ListAnalyticsEventsResult {
  items: AnalyticsEventRow[];
  total: number;
}

export class ListAnalyticsEvents implements UseCase<ListAnalyticsEventsInput, ListAnalyticsEventsResult> {
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: ListAnalyticsEventsInput): Promise<ListAnalyticsEventsResult> {
    return this.events.listByType(input.eventType, input.since, input.until, input.limit, input.offset);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/analytics/application/use-cases/list-analytics-events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/analytics/application/use-cases/list-analytics-events.ts \
  src/modules/analytics/application/use-cases/list-analytics-events.test.ts
git commit -m "feat(analytics): add ListAnalyticsEvents use case"
```

---

### Task 12: `GetEventsForIdentity` use case

**Files:**
- Create: `src/modules/analytics/application/use-cases/get-events-for-identity.ts`
- Create: `src/modules/analytics/application/use-cases/get-events-for-identity.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEventRepository.listBySessionId` (Task 9/10).
- Produces: `GetEventsForIdentity` — `execute({ sessionId, since, until }): Promise<{ events: AnalyticsEventRow[] }>` — consumed by Task 13's container wiring and Task 22's `/users` page. Email resolution (email → session/user id) happens at the page level via `FindUserByEmailForAdmin`, not inside this use case — this use case only ever takes an already-resolved `sessionId`.

- [ ] **Step 1: Write the failing test**

Create `src/modules/analytics/application/use-cases/get-events-for-identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { GetEventsForIdentity } from './get-events-for-identity';
import type { AnalyticsEventRepository, AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';

function fakeRepo(overrides: Partial<AnalyticsEventRepository> = {}): AnalyticsEventRepository {
  return {
    async record() {},
    async countByTypePerDay() {
      return [];
    },
    async topValues() {
      return [];
    },
    async topSearchTerms() {
      return [];
    },
    async listByType() {
      return { items: [], total: 0 };
    },
    async listBySessionId() {
      return [];
    },
    ...overrides,
  };
}

describe('GetEventsForIdentity', () => {
  it('passes sessionId, since, and until through to the repository', async () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-01-31');
    const events: AnalyticsEventRow[] = [
      {
        id: 'evt-1',
        eventType: 'page_view',
        sessionId: 'user-42',
        userId: 'user-42',
        path: '/products',
        referrer: null,
        userAgent: null,
        ipAddress: null,
        metadata: null,
        createdAt: new Date('2026-01-05'),
      },
    ];

    const repo = fakeRepo({
      async listBySessionId(sessionId, s, u) {
        expect(sessionId).toBe('user-42');
        expect(s).toBe(since);
        expect(u).toBe(until);
        return events;
      },
    });

    const result = await new GetEventsForIdentity(repo).execute({ sessionId: 'user-42', since, until });

    expect(result).toEqual({ events });
  });

  it('returns an empty list when the identity has no events in range', async () => {
    const repo = fakeRepo();

    const result = await new GetEventsForIdentity(repo).execute({
      sessionId: 'nobody',
      since: new Date('2026-01-01'),
      until: new Date('2026-01-31'),
    });

    expect(result).toEqual({ events: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/modules/analytics/application/use-cases/get-events-for-identity.test.ts`
Expected: FAIL — `get-events-for-identity.ts` doesn't exist yet.

- [ ] **Step 3: Write the use case**

Create `src/modules/analytics/application/use-cases/get-events-for-identity.ts`:

```ts
import type { UseCase } from '@/shared/application/use-case';
import type { AnalyticsEventRepository, AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';

export interface GetEventsForIdentityInput {
  sessionId: string;
  since: Date;
  until: Date;
}

export interface GetEventsForIdentityResult {
  events: AnalyticsEventRow[];
}

/** Takes an already-resolved sessionId (or, for a logged-in user, their
 * userId — the two are the same value at write time, see the port's doc
 * comment on `listBySessionId`). Email-to-identity resolution happens at
 * the page level via `FindUserByEmailForAdmin`. */
export class GetEventsForIdentity implements UseCase<GetEventsForIdentityInput, GetEventsForIdentityResult> {
  constructor(private readonly events: AnalyticsEventRepository) {}

  async execute(input: GetEventsForIdentityInput): Promise<GetEventsForIdentityResult> {
    const events = await this.events.listBySessionId(input.sessionId, input.since, input.until);
    return { events };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/modules/analytics/application/use-cases/get-events-for-identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/analytics/application/use-cases/get-events-for-identity.ts \
  src/modules/analytics/application/use-cases/get-events-for-identity.test.ts
git commit -m "feat(analytics): add GetEventsForIdentity use case"
```

---

### Task 13: Wire both new use cases into the container

**Files:**
- Modify: `src/composition/container.ts`

**Interfaces:**
- Consumes: `ListAnalyticsEvents` (Task 11), `GetEventsForIdentity` (Task 12), the existing `analyticsEventRepository` local variable already constructed in `build()`.
- Produces: `Container.listAnalyticsEvents: ListAnalyticsEvents`, `Container.getEventsForIdentity: GetEventsForIdentity` — consumed by Tasks 14-22.

No test — `container.ts` is DI wiring, not unit tested anywhere in this repo (matches existing precedent).

- [ ] **Step 1: Add the imports**

In `src/composition/container.ts`, immediately after the existing line:

```ts
import { GetWebAnalyticsSummary } from '@/modules/analytics/application/use-cases/get-web-analytics-summary';
```

add:

```ts
import { ListAnalyticsEvents } from '@/modules/analytics/application/use-cases/list-analytics-events';
import { GetEventsForIdentity } from '@/modules/analytics/application/use-cases/get-events-for-identity';
```

- [ ] **Step 2: Add the two fields to the `Container` interface**

In the `Container` interface, immediately after the existing line:

```ts
  getWebAnalyticsSummary: GetWebAnalyticsSummary;
```

add:

```ts
  listAnalyticsEvents: ListAnalyticsEvents;
  getEventsForIdentity: GetEventsForIdentity;
```

- [ ] **Step 3: Construct both use cases in `build()`**

In `build()`, immediately after the existing line:

```ts
  const getWebAnalyticsSummary = new GetWebAnalyticsSummary(analyticsEventRepository);
```

add:

```ts
  const listAnalyticsEvents = new ListAnalyticsEvents(analyticsEventRepository);
  const getEventsForIdentity = new GetEventsForIdentity(analyticsEventRepository);
```

- [ ] **Step 4: Add both to the returned object**

In the `return { ... }` object at the end of `build()`, immediately after the existing line:

```ts
    getWebAnalyticsSummary,
```

add:

```ts
    listAnalyticsEvents,
    getEventsForIdentity,
```

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

```bash
git add src/composition/container.ts
git commit -m "feat(analytics): wire ListAnalyticsEvents and GetEventsForIdentity into the container"
```

---

### Task 14: CSV export route for page views

**Files:**
- Create: `src/app/api/admin/analytics/page-views/export/route.ts`

**Interfaces:**
- Consumes: `getContainer().listAnalyticsEvents` (Task 13), `requireAdmin` (`@/app/lib/session`), `parseDateRange` (`@/app/(admin)/admin/analytics/date-range`).
- Produces: `GET /api/admin/analytics/page-views/export?from=&to=` — consumed by Task 18's page.

No test — mirrors `/api/admin/audit-log/export`, which also has no test (route handlers stay thin per `CLAUDE.md`; the logic under test is `ListAnalyticsEvents`, already covered in Task 11).

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/analytics/page-views/export/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { parseDateRange, type DateRangeSearchParams } from '@/app/(admin)/admin/analytics/date-range';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Analytics events are far higher-volume than the curated audit log
// (EXPORT_LIMIT there is 100_000) — every export here is already scoped
// to a date range via from/to, so this is a safety cap against an
// accidentally huge range, not the primary bound.
const EXPORT_LIMIT = 50_000;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const searchParams: DateRangeSearchParams = {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  };
  const { since, until } = parseDateRange(searchParams);

  const { listAnalyticsEvents } = getContainer();
  const { items } = await listAnalyticsEvents.execute({
    eventType: 'page_view',
    since,
    until,
    limit: EXPORT_LIMIT,
    offset: 0,
  });

  const header = ['id', 'createdAt', 'path', 'referrer', 'sessionId', 'userId', 'userAgent', 'ipAddress'];
  const rows = items.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      row.path ?? '',
      row.referrer ?? '',
      row.sessionId ?? '',
      row.userId ?? '',
      row.userAgent ?? '',
      row.ipAddress ?? '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="page-views-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add src/app/api/admin/analytics/page-views/export/route.ts
git commit -m "feat(analytics): add page-views CSV export route"
```

---

### Task 15: CSV export route for searches

**Files:**
- Create: `src/app/api/admin/analytics/searches/export/route.ts`

**Interfaces:**
- Consumes: same as Task 14.
- Produces: `GET /api/admin/analytics/searches/export?from=&to=` — consumed by Task 19's page.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/analytics/searches/export/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { parseDateRange, type DateRangeSearchParams } from '@/app/(admin)/admin/analytics/date-range';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EXPORT_LIMIT = 50_000;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const searchParams: DateRangeSearchParams = {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  };
  const { since, until } = parseDateRange(searchParams);

  const { listAnalyticsEvents } = getContainer();
  const { items } = await listAnalyticsEvents.execute({
    eventType: 'search',
    since,
    until,
    limit: EXPORT_LIMIT,
    offset: 0,
  });

  const header = ['id', 'createdAt', 'term', 'resultCount', 'sessionId', 'userId', 'userAgent', 'ipAddress'];
  const rows = items.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      metadataString(row.metadata, 'term'),
      metadataString(row.metadata, 'resultCount'),
      row.sessionId ?? '',
      row.userId ?? '',
      row.userAgent ?? '',
      row.ipAddress ?? '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="searches-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add src/app/api/admin/analytics/searches/export/route.ts
git commit -m "feat(analytics): add searches CSV export route"
```

---

### Task 16: CSV export route for cart activity

**Files:**
- Create: `src/app/api/admin/analytics/cart/export/route.ts`

**Interfaces:**
- Consumes: same as Task 14.
- Produces: `GET /api/admin/analytics/cart/export?from=&to=` — consumed by Task 20's page.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/analytics/cart/export/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { parseDateRange, type DateRangeSearchParams } from '@/app/(admin)/admin/analytics/date-range';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EXPORT_LIMIT = 50_000;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function linesSummary(metadata: Record<string, unknown> | null): string {
  const lines = metadata?.lines;
  if (!Array.isArray(lines)) return '';
  return lines
    .map((line) => {
      if (typeof line !== 'object' || line === null) return '';
      const { variantId, quantity } = line as Record<string, unknown>;
      return `${String(variantId)}×${String(quantity)}`;
    })
    .join(' ');
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const searchParams: DateRangeSearchParams = {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  };
  const { since, until } = parseDateRange(searchParams);

  const { listAnalyticsEvents } = getContainer();
  const { items } = await listAnalyticsEvents.execute({
    eventType: 'cart_changed',
    since,
    until,
    limit: EXPORT_LIMIT,
    offset: 0,
  });

  const header = ['id', 'createdAt', 'lines', 'sessionId', 'userId', 'userAgent', 'ipAddress'];
  const rows = items.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      linesSummary(row.metadata),
      row.sessionId ?? '',
      row.userId ?? '',
      row.userAgent ?? '',
      row.ipAddress ?? '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cart-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add src/app/api/admin/analytics/cart/export/route.ts
git commit -m "feat(analytics): add cart activity CSV export route"
```

---

### Task 17: CSV export route for on-chain activity

**Files:**
- Create: `src/app/api/admin/analytics/on-chain/export/route.ts`

**Interfaces:**
- Consumes: `getContainer().getOnChainActivityReport` (existing, from Phase 1), `requireAdmin`, `parseDateRange`.
- Produces: `GET /api/admin/analytics/on-chain/export?from=&to=` — consumed by Task 21's page.

- [ ] **Step 1: Write the route**

Create `src/app/api/admin/analytics/on-chain/export/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { parseDateRange, type DateRangeSearchParams } from '@/app/(admin)/admin/analytics/date-range';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const searchParams: DateRangeSearchParams = {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  };
  const { since, until } = parseDateRange(searchParams);

  const { getOnChainActivityReport } = getContainer();
  const { orders } = await getOnChainActivityReport.execute({ since, until });

  const header = ['orderId', 'address', 'expectedBtc', 'confirmations', 'underpaid', 'overpaid', 'paidAt'];
  const rows = orders.map((o) =>
    [
      o.orderId,
      o.address,
      satsToBtcString(o.expectedSats),
      String(o.confirmations),
      String(o.underpaid),
      String(o.overpaid),
      o.paidAt.toISOString(),
    ]
      .map((v) => csvEscape(v))
      .join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="on-chain-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add src/app/api/admin/analytics/on-chain/export/route.ts
git commit -m "feat(analytics): add on-chain activity CSV export route"
```

---

### Task 18: `/admin/analytics/page-views` page

**Files:**
- Create: `src/app/(admin)/admin/analytics/page-views/page.tsx`
- Create: `src/app/(admin)/admin/analytics/page-views/page.module.css`

**Interfaces:**
- Consumes: `getContainer().getWebAnalyticsSummary`, `getContainer().listAnalyticsEvents` (Task 13), `DateRangePicker`, `StatCard`/`StatCardRow`, `DataTable`, `ChartCard`, `DailyBarChart`, `Pagination`/`paginate` (`@/components/ui`).
- Produces: nothing new for later tasks.

No test — Server Component page, matches existing precedent.

- [ ] **Step 1: Write the page**

Create `src/app/(admin)/admin/analytics/page-views/page.tsx`:

```tsx
import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Pagination } from '@/components/ui/Pagination';
import { parsePage } from '@/components/ui/paginate';
import type { AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';
import { parseDateRange, type DateRangeSearchParams } from '../date-range';
import { DateRangePicker } from '../components/DateRangePicker';
import { StatCard } from '../components/StatCard';
import { StatCardRow } from '../components/StatCardRow';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { ChartCard } from '../components/ChartCard';
import { DailyBarChart } from '../components/DailyBarChart';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface PageViewsPageProps {
  searchParams: Promise<DateRangeSearchParams & { page?: string }>;
}

const columns: DataTableColumn<AnalyticsEventRow>[] = [
  { key: 'when', header: 'When', render: (r) => r.createdAt.toLocaleString() },
  { key: 'path', header: 'Path', render: (r) => r.path ?? '—' },
  { key: 'referrer', header: 'Referrer', render: (r) => r.referrer ?? '—' },
  { key: 'session', header: 'Session', render: (r) => (r.sessionId ? r.sessionId.slice(0, 12) : '—') },
];

function buildHref(since: Date, until: Date, nextPage: number): string {
  const params = new URLSearchParams();
  params.set('from', since.toISOString().slice(0, 10));
  params.set('to', until.toISOString().slice(0, 10));
  if (nextPage > 1) params.set('page', String(nextPage));
  return `/admin/analytics/page-views?${params.toString()}`;
}

export default async function PageViewsPage({ searchParams }: PageViewsPageProps) {
  await requireAdmin();
  const resolvedParams = await searchParams;
  const { since, until } = parseDateRange(resolvedParams);
  const requestedPage = parsePage(resolvedParams.page);

  const { getWebAnalyticsSummary, listAnalyticsEvents } = getContainer();

  const [summary, listResult] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    listAnalyticsEvents.execute({
      eventType: 'page_view',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (requestedPage - 1) * PAGE_SIZE,
    }),
  ]);

  let { items, total } = listResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let page = requestedPage;

  if (requestedPage > totalPages) {
    page = totalPages;
    ({ items, total } = await listAnalyticsEvents.execute({
      eventType: 'page_view',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  }

  const totalViews = summary.pageViewsPerDay.reduce((sum, d) => sum + d.count, 0);

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.headerRow}>
          <h1>Page views</h1>
          <div className={styles.links}>
            <a href={`/admin/analytics/users`} className={styles.exportLink}>
              View by user
            </a>
            <a
              href={`/api/admin/analytics/page-views/export?from=${since.toISOString().slice(0, 10)}&to=${until.toISOString().slice(0, 10)}`}
              className={styles.exportLink}
            >
              Export CSV
            </a>
          </div>
        </div>
        <DateRangePicker since={since} until={until} action="/admin/analytics/page-views" />

        <StatCardRow>
          <StatCard label="Total views" value={String(totalViews)} />
        </StatCardRow>

        <ChartCard title="Views per day">
          {summary.pageViewsPerDay.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <DailyBarChart data={summary.pageViewsPerDay} label="views" />
          )}
        </ChartCard>

        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          emptyLabel="No page views in this window."
        />

        <Pagination page={page} totalPages={totalPages} buildHref={(p) => buildHref(since, until, p)} />
      </Stack>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Write the CSS module**

Create `src/app/(admin)/admin/analytics/page-views/page.module.css`:

```css
.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.links {
  display: flex;
  gap: var(--space-2);
}

.exportLink {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  color: inherit;
  text-decoration: none;
}

.exportLink:hover {
  border-color: var(--color-accent);
}

.empty {
  color: var(--color-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; `/admin/analytics/page-views` appears in the build's route list.

```bash
git add "src/app/(admin)/admin/analytics/page-views"
git commit -m "feat(analytics): add /admin/analytics/page-views drill-down page"
```

---

### Task 19: `/admin/analytics/searches` page

**Files:**
- Create: `src/app/(admin)/admin/analytics/searches/page.tsx`
- Create: `src/app/(admin)/admin/analytics/searches/page.module.css`

**Interfaces:** same shape as Task 18, for `eventType: 'search'`.

- [ ] **Step 1: Write the page**

Create `src/app/(admin)/admin/analytics/searches/page.tsx`:

```tsx
import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { parsePage } from '@/components/ui/paginate';
import type { AnalyticsEventRow, ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import { parseDateRange, type DateRangeSearchParams } from '../date-range';
import { DateRangePicker } from '../components/DateRangePicker';
import { StatCard } from '../components/StatCard';
import { StatCardRow } from '../components/StatCardRow';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { ChartCard } from '../components/ChartCard';
import { DailyBarChart } from '../components/DailyBarChart';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface SearchesPageProps {
  searchParams: Promise<DateRangeSearchParams & { page?: string }>;
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
}

const columns: DataTableColumn<AnalyticsEventRow>[] = [
  { key: 'when', header: 'When', render: (r) => r.createdAt.toLocaleString() },
  { key: 'term', header: 'Term', render: (r) => metadataString(r.metadata, 'term') },
  { key: 'results', header: 'Results', render: (r) => metadataString(r.metadata, 'resultCount') },
  { key: 'session', header: 'Session', render: (r) => (r.sessionId ? r.sessionId.slice(0, 12) : '—') },
];

const termColumns: DataTableColumn<ValueCount>[] = [
  { key: 'value', header: 'Term', render: (r) => r.value },
  { key: 'count', header: 'Count', render: (r) => r.count },
];

function buildHref(since: Date, until: Date, nextPage: number): string {
  const params = new URLSearchParams();
  params.set('from', since.toISOString().slice(0, 10));
  params.set('to', until.toISOString().slice(0, 10));
  if (nextPage > 1) params.set('page', String(nextPage));
  return `/admin/analytics/searches?${params.toString()}`;
}

export default async function SearchesPage({ searchParams }: SearchesPageProps) {
  await requireAdmin();
  const resolvedParams = await searchParams;
  const { since, until } = parseDateRange(resolvedParams);
  const requestedPage = parsePage(resolvedParams.page);

  const { getWebAnalyticsSummary, listAnalyticsEvents } = getContainer();

  const [summary, listResult] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    listAnalyticsEvents.execute({
      eventType: 'search',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (requestedPage - 1) * PAGE_SIZE,
    }),
  ]);

  let { items, total } = listResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let page = requestedPage;

  if (requestedPage > totalPages) {
    page = totalPages;
    ({ items, total } = await listAnalyticsEvents.execute({
      eventType: 'search',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  }

  const totalSearches = summary.searchesPerDay.reduce((sum, d) => sum + d.count, 0);

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.headerRow}>
          <h1>Searches</h1>
          <div className={styles.links}>
            <a href={`/admin/analytics/users`} className={styles.exportLink}>
              View by user
            </a>
            <a
              href={`/api/admin/analytics/searches/export?from=${since.toISOString().slice(0, 10)}&to=${until.toISOString().slice(0, 10)}`}
              className={styles.exportLink}
            >
              Export CSV
            </a>
          </div>
        </div>
        <DateRangePicker since={since} until={until} action="/admin/analytics/searches" />

        <StatCardRow>
          <StatCard label="Total searches" value={String(totalSearches)} />
        </StatCardRow>

        <ChartCard title="Searches per day">
          {summary.searchesPerDay.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <DailyBarChart data={summary.searchesPerDay} label="searches" />
          )}
        </ChartCard>

        <Card>
          <h3 className={styles.cardTitle}>Top search terms</h3>
          <DataTable
            columns={termColumns}
            rows={summary.topSearchTerms}
            rowKey={(r) => r.value}
            emptyLabel="No searches yet."
          />
        </Card>

        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          emptyLabel="No searches in this window."
        />

        <Pagination page={page} totalPages={totalPages} buildHref={(p) => buildHref(since, until, p)} />
      </Stack>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Write the CSS module**

Create `src/app/(admin)/admin/analytics/searches/page.module.css`:

```css
.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.links {
  display: flex;
  gap: var(--space-2);
}

.exportLink {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  color: inherit;
  text-decoration: none;
}

.exportLink:hover {
  border-color: var(--color-accent);
}

.empty {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.cardTitle {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: var(--space-3);
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; `/admin/analytics/searches` appears in the build's route list.

```bash
git add "src/app/(admin)/admin/analytics/searches"
git commit -m "feat(analytics): add /admin/analytics/searches drill-down page"
```

---

### Task 20: `/admin/analytics/cart` page

**Files:**
- Create: `src/app/(admin)/admin/analytics/cart/page.tsx`
- Create: `src/app/(admin)/admin/analytics/cart/page.module.css`

**Interfaces:** same shape as Task 18, for `eventType: 'cart_changed'`.

- [ ] **Step 1: Write the page**

Create `src/app/(admin)/admin/analytics/cart/page.tsx`:

```tsx
import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Pagination } from '@/components/ui/Pagination';
import { parsePage } from '@/components/ui/paginate';
import type { AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';
import { parseDateRange, type DateRangeSearchParams } from '../date-range';
import { DateRangePicker } from '../components/DateRangePicker';
import { StatCard } from '../components/StatCard';
import { StatCardRow } from '../components/StatCardRow';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { ChartCard } from '../components/ChartCard';
import { DailyBarChart } from '../components/DailyBarChart';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface CartActivityPageProps {
  searchParams: Promise<DateRangeSearchParams & { page?: string }>;
}

function linesSummary(metadata: Record<string, unknown> | null): string {
  const lines = metadata?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return '—';
  return lines
    .map((line) => {
      if (typeof line !== 'object' || line === null) return '';
      const { variantId, quantity } = line as Record<string, unknown>;
      return `${String(variantId).slice(0, 8)} ×${String(quantity)}`;
    })
    .join(', ');
}

const columns: DataTableColumn<AnalyticsEventRow>[] = [
  { key: 'when', header: 'When', render: (r) => r.createdAt.toLocaleString() },
  { key: 'lines', header: 'Lines', render: (r) => linesSummary(r.metadata) },
  { key: 'session', header: 'Session', render: (r) => (r.sessionId ? r.sessionId.slice(0, 12) : '—') },
];

function buildHref(since: Date, until: Date, nextPage: number): string {
  const params = new URLSearchParams();
  params.set('from', since.toISOString().slice(0, 10));
  params.set('to', until.toISOString().slice(0, 10));
  if (nextPage > 1) params.set('page', String(nextPage));
  return `/admin/analytics/cart?${params.toString()}`;
}

export default async function CartActivityPage({ searchParams }: CartActivityPageProps) {
  await requireAdmin();
  const resolvedParams = await searchParams;
  const { since, until } = parseDateRange(resolvedParams);
  const requestedPage = parsePage(resolvedParams.page);

  const { getWebAnalyticsSummary, listAnalyticsEvents } = getContainer();

  const [summary, listResult] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    listAnalyticsEvents.execute({
      eventType: 'cart_changed',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (requestedPage - 1) * PAGE_SIZE,
    }),
  ]);

  let { items, total } = listResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let page = requestedPage;

  if (requestedPage > totalPages) {
    page = totalPages;
    ({ items, total } = await listAnalyticsEvents.execute({
      eventType: 'cart_changed',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  }

  const totalCartChanges = summary.cartChangesPerDay.reduce((sum, d) => sum + d.count, 0);

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.headerRow}>
          <h1>Cart activity</h1>
          <div className={styles.links}>
            <a href={`/admin/analytics/users`} className={styles.exportLink}>
              View by user
            </a>
            <a
              href={`/api/admin/analytics/cart/export?from=${since.toISOString().slice(0, 10)}&to=${until.toISOString().slice(0, 10)}`}
              className={styles.exportLink}
            >
              Export CSV
            </a>
          </div>
        </div>
        <DateRangePicker since={since} until={until} action="/admin/analytics/cart" />

        <StatCardRow>
          <StatCard label="Total cart changes" value={String(totalCartChanges)} />
        </StatCardRow>

        <ChartCard title="Cart changes per day">
          {summary.cartChangesPerDay.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <DailyBarChart data={summary.cartChangesPerDay} label="cart changes" />
          )}
        </ChartCard>

        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          emptyLabel="No cart activity in this window."
        />

        <Pagination page={page} totalPages={totalPages} buildHref={(p) => buildHref(since, until, p)} />
      </Stack>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Write the CSS module**

Create `src/app/(admin)/admin/analytics/cart/page.module.css`:

```css
.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.links {
  display: flex;
  gap: var(--space-2);
}

.exportLink {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  color: inherit;
  text-decoration: none;
}

.exportLink:hover {
  border-color: var(--color-accent);
}

.empty {
  color: var(--color-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; `/admin/analytics/cart` appears in the build's route list.

```bash
git add "src/app/(admin)/admin/analytics/cart"
git commit -m "feat(analytics): add /admin/analytics/cart drill-down page"
```

---

### Task 21: `/admin/analytics/on-chain` page

**Files:**
- Create: `src/app/(admin)/admin/analytics/on-chain/page.tsx`
- Create: `src/app/(admin)/admin/analytics/on-chain/page.module.css`

**Interfaces:**
- Consumes: `getContainer().getOnChainActivityReport` (existing), `DateRangePicker`, `StatCard`/`StatCardRow`, `DataTable`, `ChartCard`, `OnChainChart`. No pagination (matches the existing main-dashboard paid-orders table, which is also unpaginated) and no "View by user" link (on-chain activity isn't tied to a session/user identity the way web events are — per spec).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the page**

Create `src/app/(admin)/admin/analytics/on-chain/page.tsx`:

```tsx
import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { OnChainOrderActivity } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import { parseDateRange, type DateRangeSearchParams } from '../date-range';
import { DateRangePicker } from '../components/DateRangePicker';
import { StatCard } from '../components/StatCard';
import { StatCardRow } from '../components/StatCardRow';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { ChartCard } from '../components/ChartCard';
import { OnChainChart } from '../components/OnChainChart';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface OnChainPageProps {
  searchParams: Promise<DateRangeSearchParams>;
}

const columns: DataTableColumn<OnChainOrderActivity>[] = [
  {
    key: 'order',
    header: 'Order',
    render: (o) => <Link href={`/admin/orders/${o.orderId}`}>{o.orderId.slice(0, 8)}</Link>,
  },
  { key: 'address', header: 'Address', render: (o) => o.address },
  { key: 'amount', header: 'Amount', render: (o) => `${satsToBtcString(o.expectedSats)} BTC` },
  { key: 'confirmations', header: 'Confirmations', render: (o) => o.confirmations },
  {
    key: 'flags',
    header: 'Flags',
    render: (o) => (
      <>
        {o.underpaid && <Badge tone="danger">Underpaid</Badge>}
        {o.overpaid && <Badge tone="warning">Overpaid</Badge>}
      </>
    ),
  },
];

export default async function OnChainPage({ searchParams }: OnChainPageProps) {
  await requireAdmin();
  const { since, until } = parseDateRange(await searchParams);

  const { getOnChainActivityReport } = getContainer();
  const report = await getOnChainActivityReport.execute({ since, until });

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.headerRow}>
          <h1>On-chain activity</h1>
          <a
            href={`/api/admin/analytics/on-chain/export?from=${since.toISOString().slice(0, 10)}&to=${until.toISOString().slice(0, 10)}`}
            className={styles.exportLink}
          >
            Export CSV
          </a>
        </div>
        <DateRangePicker since={since} until={until} action="/admin/analytics/on-chain" />

        <p className={styles.meta}>
          Totals use each order&apos;s expected amount as a stand-in for actually-received sats
          (accurate in the common exact-payment case) — underpaid/overpaid orders are flagged
          below rather than silently folded into the total.
        </p>

        <StatCardRow>
          <StatCard label="Total received (proxy)" value={`${satsToBtcString(report.totalSats)} BTC`} />
          <StatCard label="Distinct addresses" value={String(report.addressCount)} />
        </StatCardRow>

        <ChartCard title="Sats received per day">
          {report.satsPerDay.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <OnChainChart data={report.satsPerDay} />
          )}
        </ChartCard>

        <Card>
          <h3 className={styles.cardTitle}>Paid orders</h3>
          <DataTable
            columns={columns}
            rows={report.orders}
            rowKey={(o) => o.orderId}
            emptyLabel="No paid orders in this window."
          />
        </Card>
      </Stack>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Write the CSS module**

Create `src/app/(admin)/admin/analytics/on-chain/page.module.css`:

```css
.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.exportLink {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  color: inherit;
  text-decoration: none;
}

.exportLink:hover {
  border-color: var(--color-accent);
}

.meta {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.empty {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.cardTitle {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: var(--space-3);
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; `/admin/analytics/on-chain` appears in the build's route list.

```bash
git add "src/app/(admin)/admin/analytics/on-chain"
git commit -m "feat(analytics): add /admin/analytics/on-chain drill-down page"
```

---

### Task 22: `/admin/analytics/users` identity-lookup timeline page

**Files:**
- Create: `src/app/(admin)/admin/analytics/users/page.tsx`
- Create: `src/app/(admin)/admin/analytics/users/page.module.css`

**Interfaces:**
- Consumes: `getContainer().findUserByEmailForAdmin` (existing), `getContainer().getEventsForIdentity` (Task 13), `DateRangePicker`, `DataTable`.
- Produces: nothing new for later tasks — this is the plan's last new page.

- [ ] **Step 1: Write the page**

Create `src/app/(admin)/admin/analytics/users/page.tsx`:

```tsx
import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { AnalyticsEventRow } from '@/modules/analytics/application/ports/analytics-event-repository';
import { parseDateRange, type DateRangeSearchParams } from '../date-range';
import { DateRangePicker } from '../components/DateRangePicker';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AnalyticsUsersPageProps {
  searchParams: Promise<DateRangeSearchParams & { identity?: string }>;
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string {
  const value = metadata?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function eventDetails(row: AnalyticsEventRow): string {
  if (row.eventType === 'page_view') return row.path ?? '—';
  if (row.eventType === 'search') {
    const term = metadataString(row.metadata, 'term');
    const resultCount = metadataString(row.metadata, 'resultCount');
    return term ? `"${term}" (${resultCount || '0'} results)` : '—';
  }
  const lines = row.metadata?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return '—';
  return lines
    .map((line) => {
      if (typeof line !== 'object' || line === null) return '';
      const { variantId, quantity } = line as Record<string, unknown>;
      return `${String(variantId).slice(0, 8)} ×${String(quantity)}`;
    })
    .join(', ');
}

const columns: DataTableColumn<AnalyticsEventRow>[] = [
  { key: 'when', header: 'When', render: (r) => r.createdAt.toLocaleString() },
  { key: 'type', header: 'Type', render: (r) => r.eventType },
  { key: 'details', header: 'Details', render: eventDetails },
];

export default async function AnalyticsUsersPage({ searchParams }: AnalyticsUsersPageProps) {
  await requireAdmin();
  const resolvedParams = await searchParams;
  const { since, until } = parseDateRange(resolvedParams);
  const { identity } = resolvedParams;

  const { findUserByEmailForAdmin, getEventsForIdentity } = getContainer();

  let events: AnalyticsEventRow[] = [];
  let resolvedLabel: string | null = null;

  if (identity) {
    const profile = await findUserByEmailForAdmin.execute({ email: identity });
    const sessionId = profile ? profile.id : identity;
    resolvedLabel = profile ? profile.email : identity;
    ({ events } = await getEventsForIdentity.execute({ sessionId, since, until }));
  }

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>User activity</h1>

        <form className={styles.searchForm}>
          <Input
            type="text"
            name="identity"
            defaultValue={identity}
            placeholder="Email or session/user id"
          />
          <Button type="submit" variant="secondary">
            Look up
          </Button>
        </form>

        {identity && <DateRangePicker since={since} until={until} action="/admin/analytics/users" />}

        {identity && events.length === 0 && (
          <p className={styles.empty}>No matching user or session found.</p>
        )}

        {identity && events.length > 0 && (
          <>
            <p className={styles.meta}>Timeline for {resolvedLabel}, oldest first.</p>
            <DataTable columns={columns} rows={events} rowKey={(r) => r.id} emptyLabel="No events." />
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Write the CSS module**

Create `src/app/(admin)/admin/analytics/users/page.module.css`:

```css
.searchForm {
  display: flex;
  gap: var(--space-3);
  max-width: 480px;
}

.meta {
  color: var(--color-muted);
  font-size: 0.875rem;
}

.empty {
  color: var(--color-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; `/admin/analytics/users` appears in the build's route list.

```bash
git add "src/app/(admin)/admin/analytics/users"
git commit -m "feat(analytics): add /admin/analytics/users identity-lookup timeline page"
```

---

### Task 23: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full verification sweep**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all four commands succeed with no errors.

- [ ] **Step 2: Confirm git state**

Run: `git status --short`
Expected: clean (everything from Tasks 1-22 already committed).

- [ ] **Step 3: Manual smoke test**

Start `npm run dev`, log in as an admin, and check:
- `/admin/analytics` — every section shows a StatCardRow, chart cards, and DataTable-backed lists; Searches has its own day chart now.
- `/admin/analytics/page-views`, `/searches`, `/cart` — date range, stat, chart, paginated table, "Export CSV" and "View by user" links all work; clicking Export CSV downloads a file.
- `/admin/analytics/on-chain` — same shape, no "View by user" link, table is the existing paid-orders table.
- `/admin/analytics/users` — looking up a known admin/customer email shows their timeline; looking up a garbage string shows "No matching user or session found."

- [ ] **Step 4: Report**

Phase 2 is complete: the dashboard's presentation layer is now StatCard/DataTable/ChartCard-based instead of ad hoc markup, and all 5 planned pages (`page-views`, `searches`, `cart`, `on-chain`, `users`) exist with date-range filtering, charts, pagination, and CSV export where applicable.
