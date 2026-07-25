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
