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
import { EventLogTable } from '../components/EventLogTable';
import styles from '../drill-down.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const BASE_PATH = '/admin/analytics/cart';

interface CartPageProps {
  searchParams: Promise<DrillDownSearchParams>;
}

/** Cart events carry the change in `metadata` rather than a path — what an
 * admin wants to see is which variant moved and by how much. */
function cartChange(row: { metadata: Record<string, unknown> | null; path: string | null }): string {
  const meta = row.metadata ?? {};
  const action = typeof meta.action === 'string' ? meta.action : null;
  const variant = typeof meta.variantId === 'string' ? meta.variantId.slice(0, 8) : null;
  const quantity = typeof meta.quantity === 'number' ? meta.quantity : null;

  const parts = [action, variant, quantity === null ? null : `×${quantity}`].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : (row.path ?? '—');
}

export default async function CartActivityPage({ searchParams }: CartPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const range = parseDateRange(params);
  const { since, until } = range;
  const page = parsePage(params.page);

  const { getWebAnalyticsSummary, listAnalyticsEvents } = getContainer();
  const [summary, listed] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    listAnalyticsEvents.execute({
      eventType: 'cart_changed',
      since,
      until,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const dayKeys = eachDayKey(since, until);
  const perDay = alignToDays(dayKeys, summary.cartChangesPerDay, (d) => d.day, (d) => d.count);
  const total = perDay.reduce((t, v) => t + v, 0);
  const totalPages = Math.max(1, Math.ceil(listed.total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <DrillDownHeader
        title="Cart activity"
        since={since}
        until={until}
        basePath={BASE_PATH}
        exportHref={exportHref('cart', range)}
      />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Cart changes per day</h2>
        <p className={styles.meta}>
          {formatCount(total)} changes · {(total / Math.max(1, dayKeys.length)).toFixed(1)} a day
        </p>
        <DailyColumnChart
          points={dayKeys.map((day, i) => ({ day, value: perDay[i] ?? 0 }))}
          peakSuffix="changes peak"
          emptyLabel="No cart activity in this range."
        />
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Recent cart changes</h2>
        <EventLogTable
          rows={listed.items}
          detailHeader="Change"
          detail={cartChange}
          emptyLabel="No cart changes in this range."
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
