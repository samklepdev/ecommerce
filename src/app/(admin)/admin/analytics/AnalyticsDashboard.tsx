import Link from 'next/link';

import type { ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import type { OnChainOrderActivity } from '@/modules/payments/application/use-cases/get-on-chain-activity-report';
import type { Delta } from './delta';
import { formatCount, formatRangeDate } from './format';
import { RangePresets } from './components/RangePresets';
import { TrafficBand, type TrafficBandPoint } from './components/TrafficBand';
import { FlaggedOrdersAlert } from './components/FlaggedOrdersAlert';
import { TrafficPanel } from './components/TrafficPanel';
import { RankedList } from './components/RankedList';
import { DailyColumnChart } from './components/DailyColumnChart';
import { PaidOrdersLedger } from './components/PaidOrdersLedger';
import styles from './page.module.css';

export interface AnalyticsDashboardProps {
  since: Date;
  until: Date;
  windowDays: number;

  /** Gap-filled traffic series for the hero band. */
  bandPoints: TrafficBandPoint[];
  /** Gap-filled sats per day, for the on-chain section's chart. */
  satsPerDay: { day: string; sats: number }[];

  /** The headline: site traffic, matching the chart directly beneath it. */
  totalViews: number;
  viewsDelta: Delta | null;

  totalRevenueLabel: string;
  revenueDelta: Delta | null;
  totalSatsLabel: string;
  totalItems: number;
  addressCount: number;

  viewsPerDay: number[];
  searchesPerDay: number[];
  cartChangesPerDay: number[];

  topPaths: ValueCount[];
  topReferrers: ValueCount[];
  topSearchTerms: ValueCount[];

  orders: OnChainOrderActivity[];
  requiredConfirmations: number;
}

const sumOf = (values: number[]) => values.reduce((total, v) => total + v, 0);

/**
 * The whole dashboard as a pure function of already-fetched data.
 *
 * Split from `page.tsx` so the view can be rendered — and therefore
 * regression-tested — without a database, a container, or a session. The
 * page above it does nothing but fetch, shape, and hand over.
 */
export function AnalyticsDashboard({
  since,
  until,
  windowDays,
  bandPoints,
  satsPerDay,
  totalViews,
  viewsDelta,
  totalRevenueLabel,
  revenueDelta,
  totalSatsLabel,
  totalItems,
  addressCount,
  viewsPerDay,
  searchesPerDay,
  cartChangesPerDay,
  topPaths,
  topReferrers,
  topSearchTerms,
  orders,
  requiredConfirmations,
}: AnalyticsDashboardProps) {
  const underpaid = orders.filter((o) => o.underpaid).length;
  const overpaid = orders.filter((o) => o.overpaid).length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <h1>Analytics</h1>
        </div>
        <div className={styles.controls}>
          <RangePresets since={since} until={until} basePath="/admin/analytics" />
          <span className={styles.rangeText}>
            {formatRangeDate(since)} — {formatRangeDate(until)}
          </span>
        </div>
      </header>

      {/* Headline and chart are the same measure — site traffic — so the
          number above the plot is the number the plot draws. Revenue leads
          the stat row beside it. */}
      <section className={styles.hero}>
        <div className={styles.heroHead}>
          <div className={styles.heroPrimary}>
            <span className={styles.eyebrow}>Page views</span>
            <span className={styles.heroValue}>{formatCount(totalViews)}</span>
            {viewsDelta ? (
              <span
                className={`${styles.delta} ${
                  viewsDelta.direction === 'down' ? styles.down : styles.up
                }`}
              >
                {viewsDelta.direction === 'down' ? '▼' : '▲'} {viewsDelta.percent}%
                <span className={styles.deltaNote}>vs previous {windowDays} days</span>
              </span>
            ) : (
              <span className={styles.delta}>
                <span className={styles.deltaNote}>No traffic in the previous {windowDays} days</span>
              </span>
            )}
          </div>

          <dl className={styles.heroStats}>
            <div>
              <dt>Revenue booked</dt>
              <dd>
                {totalRevenueLabel}
                {revenueDelta && (
                  <span
                    className={`${styles.statDelta} ${
                      revenueDelta.direction === 'down' ? styles.down : styles.up
                    }`}
                  >
                    {revenueDelta.direction === 'down' ? '▼' : '▲'} {revenueDelta.percent}%
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Sats received</dt>
              <dd className={styles.amberText}>{totalSatsLabel} BTC</dd>
            </div>
            <div>
              <dt>Items sold</dt>
              <dd>{formatCount(totalItems)}</dd>
            </div>
            <div>
              <dt>Paying addresses</dt>
              <dd>{formatCount(addressCount)}</dd>
            </div>
          </dl>
        </div>

        {bandPoints.length > 0 && <TrafficBand points={bandPoints} />}
      </section>

      <FlaggedOrdersAlert
        underpaid={underpaid}
        overpaid={overpaid}
        href="/admin/analytics/on-chain"
      />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Site traffic</h2>
          <span className={styles.sectionLinks}>
            {/* The three panels below slice by event type across everyone;
                this one slices by person across every type. */}
            <Link href="/admin/analytics/identity">By visitor →</Link>
            <Link href="/admin/analytics/page-views">All activity →</Link>
          </span>
        </div>

        <div className={styles.panels}>
          <TrafficPanel
            label="Page views"
            total={sumOf(viewsPerDay)}
            values={viewsPerDay}
            days={windowDays}
            tone="slate"
            href="/admin/analytics/page-views"
          />
          <TrafficPanel
            label="Searches"
            total={sumOf(searchesPerDay)}
            values={searchesPerDay}
            days={windowDays}
            tone="slate"
            href="/admin/analytics/searches"
          />
          <TrafficPanel
            label="Cart changes"
            total={sumOf(cartChangesPerDay)}
            values={cartChangesPerDay}
            days={windowDays}
            tone="accent"
            href="/admin/analytics/cart"
          />
        </div>

        <div className={styles.lists}>
          <RankedList title="Top pages" items={topPaths} unit="views" />
          <RankedList title="Top referrers" items={topReferrers} unit="sessions" />
          <RankedList title="Top search terms" items={topSearchTerms} unit="searches" />
        </div>
      </section>

      <section className={styles.onchain}>
        <div className={styles.sectionHead}>
          <h2>On-chain settlement</h2>
          <Link href="/admin/analytics/on-chain">All activity →</Link>
        </div>
        <p className={styles.note}>
          Totals use each order&apos;s expected amount as a stand-in for received sats — exact
          in the common case. Underpaid and overpaid orders are flagged below rather than
          folded into the total.
        </p>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Sats received per day</h3>
          <DailyColumnChart
            points={satsPerDay.map((d) => ({ day: d.day, value: d.sats }))}
            tone="amber"
            peakSuffix="sats peak"
            emptyLabel="Nothing settled on-chain in this range yet."
          />
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Paid orders</h3>
          <PaidOrdersLedger orders={orders} requiredConfirmations={requiredConfirmations} />
        </div>
      </section>
    </div>
  );
}
