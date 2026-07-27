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
import { EventLogTable } from '../components/EventLogTable';
import styles from '../drill-down.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const BASE_PATH = '/admin/analytics/searches';

interface SearchesPageProps {
  searchParams: Promise<DrillDownSearchParams>;
}

/** What a visitor typed, read from `metadata.term` on the event — the same
 * field `topSearchTerms` aggregates. */
function searchTerm(row: { metadata: Record<string, unknown> | null }): string {
  const term = row.metadata?.term;
  return typeof term === 'string' && term.length > 0 ? term : '—';
}

export default async function SearchesPage({ searchParams }: SearchesPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseDateRange(params);
  const { since, until } = range;
  const page = parsePage(params.page);

  const { getWebAnalyticsSummary, listAnalyticsEvents } = getContainer();
  const [summary, listed] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    listAnalyticsEvents.execute({
      eventType: 'search',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const dayKeys = eachDayKey(since, until);
  const perDay = alignToDays(dayKeys, summary.searchesPerDay, (d) => d.day, (d) => d.count);
  const total = perDay.reduce((t, v) => t + v, 0);
  const totalPages = Math.max(1, Math.ceil(listed.total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <DrillDownHeader
        title="Searches"
        since={since}
        until={until}
        basePath={BASE_PATH}
        exportHref={exportHref('searches', range)}
      />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Searches per day</h2>
        <p className={styles.meta}>
          {formatCount(total)} searches · {(total / Math.max(1, dayKeys.length)).toFixed(1)} a day
        </p>
        <DailyColumnChart
          points={dayKeys.map((day, i) => ({ day, value: perDay[i] ?? 0 }))}
          peakSuffix="searches peak"
          emptyLabel="Nobody searched in this range."
        />
      </div>

      <div className={styles.split}>
        <RankedList title="Top search terms" items={summary.topSearchTerms} unit="searches" />
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Recent searches</h2>
        <EventLogTable
          rows={listed.items}
          detailHeader="Term"
          detail={searchTerm}
          emptyLabel="No searches in this range."
        />
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => pageHref(BASE_PATH, range, p)}
      />
    </div>
  );
}
