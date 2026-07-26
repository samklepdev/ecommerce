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
