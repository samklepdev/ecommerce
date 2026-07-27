import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { Pagination } from '@/components/ui/Pagination';
import { parsePage } from '@/components/ui/paginate';
import { parseDateRange } from '../date-range';
import { alignToDays, eachDayKey } from '../series';
import { formatCount } from '../format';
import { exportHref, pageHref, type DrillDownSearchParams } from '../drill-down';
import { DrillDownHeader } from '../components/DrillDownHeader';
import { DailyColumnChart } from '../components/DailyColumnChart';
import { RankedList } from '../components/RankedList';
import { PathFilter } from '../components/PathFilter';
import { DwellList } from '../components/DwellList';
import { CountryList } from '../components/CountryList';
import { WorldMapPanel } from '../components/WorldMapPanel';
import { EventLogTable } from '../components/EventLogTable';
import styles from '../drill-down.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const BASE_PATH = '/admin/analytics/page-views';

interface PageViewsPageProps {
  searchParams: Promise<DrillDownSearchParams & { path?: string }>;
}

export default async function PageViewsPage({ searchParams }: PageViewsPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseDateRange(params);
  const { since, until } = range;
  const page = parsePage(params.page);
  const pathFilter = params.path?.trim() || undefined;

  const { getWebAnalyticsSummary, listAnalyticsEvents } = getContainer();
  const [summary, listed] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    listAnalyticsEvents.execute({
      eventType: 'page_view',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      pathContains: pathFilter,
    }),
  ]);

  const dayKeys = eachDayKey(since, until);
  const perDay = alignToDays(dayKeys, summary.pageViewsPerDay, (d) => d.day, (d) => d.count);
  const total = perDay.reduce((t, v) => t + v, 0);
  const totalPages = Math.max(1, Math.ceil(listed.total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <DrillDownHeader
        title="Page views"
        since={since}
        until={until}
        basePath={BASE_PATH}
        exportHref={exportHref('page-views', range)}
      />

      <PathFilter value={pathFilter} since={since} until={until} action={BASE_PATH} />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Views per day</h2>
        <p className={styles.meta}>
          {formatCount(total)} views · {(total / Math.max(1, dayKeys.length)).toFixed(1)} a day
          {pathFilter && ' · chart covers all pages'}
        </p>
        <DailyColumnChart
          points={dayKeys.map((day, i) => ({ day, value: perDay[i] ?? 0 }))}
          peakSuffix="views peak"
          emptyLabel="No page views in this range."
        />
      </div>

      <div className={styles.split}>
        <RankedList title="Top pages" items={summary.topPaths} unit="views" />
        <DwellList items={summary.dwellByPath} />
        <CountryList items={summary.viewsByCountry} />
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Where visitors are</h2>
        <p className={styles.meta}>
          Resolved from each visitor&apos;s IP against a local database — no
          request leaves the server.
        </p>
        <WorldMapPanel countries={summary.viewsByCountry} />
        {/* CC BY 4.0 requires attribution wherever the data is shown. */}
        <p className={styles.attribution}>
          IP geolocation by{' '}
          <a href="https://db-ip.com" target="_blank" rel="noreferrer noopener">
            DB-IP
          </a>
        </p>
      </div>

      <div className={styles.split}>
        <RankedList title="Top referrers" items={summary.topReferrers} unit="sessions" />
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          {pathFilter ? `Recent page views matching “${pathFilter}”` : 'Recent page views'}
        </h2>
        <EventLogTable
          rows={listed.items}
          detailHeader="Path"
          detail={(row) => row.path ?? '—'}
          emptyLabel={
            pathFilter
              ? `No page views matching “${pathFilter}” in this range.`
              : 'No page views in this range.'
          }
        />
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => pageHref(BASE_PATH, range, p, pathFilter)}
      />
    </div>
  );
}
