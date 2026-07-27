import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { env } from '@/config/env';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { Money } from '@/shared/domain/money';
import { parseDateRange, previousWindow, type DateRangeSearchParams } from './date-range';
import { percentChange } from './delta';
import { alignToDays, eachDayKey } from './series';
import { AnalyticsDashboard } from './AnalyticsDashboard';

export const dynamic = 'force-dynamic';

interface AdminAnalyticsPageProps {
  searchParams: Promise<DateRangeSearchParams>;
}

/** Thin by design: fetch, shape, hand to `AnalyticsDashboard`. All the
 * markup lives there so it can be rendered without infrastructure. */
export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  await requireAdmin();
  const { since, until } = parseDateRange(await searchParams);
  const prior = previousWindow({ since, until });

  const { getWebAnalyticsSummary, getOnChainActivityReport, getRevenueSummary } = getContainer();

  // The prior window only feeds the deltas. It runs alongside the current
  // one rather than after it, so it costs queries, not latency.
  const [web, onChain, revenue, priorWeb, priorRevenue] = await Promise.all([
    getWebAnalyticsSummary.execute({ since, until }),
    getOnChainActivityReport.execute({ since, until }),
    getRevenueSummary.execute({ since, until }),
    getWebAnalyticsSummary.execute(prior),
    getRevenueSummary.execute(prior),
  ]);

  // One spine for every series on this page. The repositories return only
  // days that had activity, and the hero reads revenue and sats by a shared
  // index — without this, a gap in one would slide the other out of step.
  const dayKeys = eachDayKey(since, until);
  const satsByDay = alignToDays(dayKeys, onChain.satsPerDay, (d) => d.day, (d) => d.sats);
  const viewsPerDay = alignToDays(dayKeys, web.pageViewsPerDay, (d) => d.day, (d) => d.count);
  const searchesPerDay = alignToDays(dayKeys, web.searchesPerDay, (d) => d.day, (d) => d.count);
  const cartChangesPerDay = alignToDays(dayKeys, web.cartChangesPerDay, (d) => d.day, (d) => d.count);

  // `alignToDays` returns one value per day key, so these indexes always
  // land; the `?? 0` fallbacks are for noUncheckedIndexedAccess.
  //
  // `TrafficBand` is a client component, so it gets plain numbers only —
  // handing a client component formatter functions is what produced an
  // earlier server error.
  const bandPoints = dayKeys.map((day, i) => ({
    day,
    views: viewsPerDay[i] ?? 0,
    cartChanges: cartChangesPerDay[i] ?? 0,
    searches: searchesPerDay[i] ?? 0,
  }));

  const satsPerDay = dayKeys.map((day, i) => ({ day, sats: satsByDay[i] ?? 0 }));

  const sum = (values: number[]) => values.reduce((t, v) => t + v, 0);
  const totalViews = sum(viewsPerDay);
  const priorViews = priorWeb.pageViewsPerDay.reduce((t, d) => t + d.count, 0);

  const totalRevenueMinor = revenue.days.reduce((t, d) => t + d.totalMinor, 0);
  const priorRevenueMinor = priorRevenue.days.reduce((t, d) => t + d.totalMinor, 0);

  return (
    <AnalyticsDashboard
      since={since}
      until={until}
      windowDays={Math.max(1, dayKeys.length)}
      bandPoints={bandPoints}
      satsPerDay={satsPerDay}
      totalViews={totalViews}
      viewsDelta={percentChange(totalViews, priorViews)}
      totalRevenueLabel={Money.of(totalRevenueMinor, revenue.currency).toDisplayString()}
      revenueDelta={percentChange(totalRevenueMinor, priorRevenueMinor)}
      totalSatsLabel={satsToBtcString(onChain.totalSats)}
      totalItems={revenue.days.reduce((t, d) => t + d.totalQuantity, 0)}
      addressCount={onChain.addressCount}
      viewsPerDay={viewsPerDay}
      searchesPerDay={searchesPerDay}
      cartChangesPerDay={cartChangesPerDay}
      topPaths={web.topPaths}
      topReferrers={web.topReferrers}
      topSearchTerms={web.topSearchTerms}
      orders={onChain.orders}
      requiredConfirmations={env.BTC_REQUIRED_CONFIRMATIONS}
    />
  );
}
