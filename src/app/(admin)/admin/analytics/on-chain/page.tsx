import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { env } from '@/config/env';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { parseDateRange } from '../date-range';
import { alignToDays, eachDayKey } from '../series';
import { formatCount } from '../format';
import { exportHref, type DrillDownSearchParams } from '../drill-down';
import { DrillDownHeader } from '../components/DrillDownHeader';
import { DailyColumnChart } from '../components/DailyColumnChart';
import { FlaggedOrdersAlert } from '../components/FlaggedOrdersAlert';
import { PaidOrdersLedger } from '../components/PaidOrdersLedger';
import styles from '../drill-down.module.css';

export const dynamic = 'force-dynamic';

const BASE_PATH = '/admin/analytics/on-chain';

interface OnChainPageProps {
  searchParams: Promise<DrillDownSearchParams>;
}

export default async function OnChainActivityPage({ searchParams }: OnChainPageProps) {
  await requireAdmin();
  const range = parseDateRange(await searchParams);
  const { since, until } = range;

  const { getOnChainActivityReport } = getContainer();
  const report = await getOnChainActivityReport.execute({ since, until });

  const dayKeys = eachDayKey(since, until);
  const satsByDay = alignToDays(dayKeys, report.satsPerDay, (d) => d.day, (d) => d.sats);

  const underpaid = report.orders.filter((o) => o.underpaid).length;
  const overpaid = report.orders.filter((o) => o.overpaid).length;

  return (
    <div className={styles.page}>
      <DrillDownHeader
        title="On-chain settlement"
        since={since}
        until={until}
        basePath={BASE_PATH}
        exportHref={exportHref('on-chain', range)}
      />

      <p className={styles.note}>
        Totals use each order&apos;s expected amount as a stand-in for received sats — exact in
        the common case. Underpaid and overpaid orders are flagged rather than folded into the
        total. Every row opens that order.
      </p>

      {/* On the dashboard this alert is the way in to this page; here it is
          a summary of what's below, so it points at nothing. */}
      <FlaggedOrdersAlert underpaid={underpaid} overpaid={overpaid} href={BASE_PATH} />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Sats received per day</h2>
        <p className={styles.meta}>
          {satsToBtcString(report.totalSats)} BTC total · {formatCount(report.addressCount)}{' '}
          distinct addresses · {formatCount(report.orders.length)} paid orders
        </p>
        <DailyColumnChart
          points={dayKeys.map((day, i) => ({ day, value: satsByDay[i] ?? 0 }))}
          tone="amber"
          peakSuffix="sats peak"
          emptyLabel="Nothing settled on-chain in this range."
        />
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Paid orders</h2>
        <PaidOrdersLedger
          orders={report.orders}
          requiredConfirmations={env.BTC_REQUIRED_CONFIRMATIONS}
        />
      </div>
    </div>
  );
}
