import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { Money } from '@/shared/domain/money';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
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
      <Stack gap={6}>
        <Stack gap={3}>
          <h1>Analytics</h1>
          <DateRangePicker since={since} until={until} action="/admin/analytics" />
        </Stack>

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
            <ChartCard title="Top pages">
              <ValueCountTable items={web.topPaths} emptyLabel="No page views yet." />
            </ChartCard>
            <ChartCard title="Top referrers">
              <ValueCountTable items={web.topReferrers} emptyLabel="No referrer data yet." />
            </ChartCard>
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
          <ChartCard title="Top search terms">
            <ValueCountTable items={web.topSearchTerms} emptyLabel="No searches yet." />
          </ChartCard>
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

          <ChartCard title="Paid orders">
            <DataTable
              columns={orderActivityColumns}
              rows={onChain.orders}
              rowKey={(o) => o.orderId}
              emptyLabel="No paid orders in this window."
            />
          </ChartCard>
        </section>
      </Stack>
    </PageContainer>
  );
}
