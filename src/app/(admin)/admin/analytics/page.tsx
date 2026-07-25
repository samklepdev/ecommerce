import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ValueCount } from '@/modules/analytics/application/ports/analytics-event-repository';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const SINCE_DAYS = 30;

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

export default async function AdminAnalyticsPage() {
  await requireAdmin();

  const { getWebAnalyticsSummary, getOnChainActivityReport } = getContainer();
  const [web, onChain] = await Promise.all([
    getWebAnalyticsSummary.execute({ sinceDays: SINCE_DAYS }),
    getOnChainActivityReport.execute({ sinceDays: SINCE_DAYS }),
  ]);

  return (
    <PageContainer>
      <Stack gap={5}>
        <div>
          <h1>Analytics</h1>
          <p className={styles.meta}>Last {SINCE_DAYS} days.</p>
        </div>

        <section>
          <h2 className={styles.sectionTitle}>Web</h2>
          <div className={styles.grid}>
            <Card>
              <h3 className={styles.cardTitle}>Page views per day</h3>
              {web.pageViewsPerDay.length === 0 ? (
                <p className={styles.empty}>No data yet.</p>
              ) : (
                <ul className={styles.list}>
                  {web.pageViewsPerDay.map((d) => (
                    <li key={d.day} className={styles.listRow}>
                      <span>{d.day}</span>
                      <span>{d.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h3 className={styles.cardTitle}>Top pages</h3>
              <ValueCountList items={web.topPaths} emptyLabel="No page views yet." />
            </Card>
            <Card>
              <h3 className={styles.cardTitle}>Top referrers</h3>
              <ValueCountList items={web.topReferrers} emptyLabel="No referrer data yet." />
            </Card>
            <Card>
              <h3 className={styles.cardTitle}>Top search terms</h3>
              <ValueCountList items={web.topSearchTerms} emptyLabel="No searches yet." />
            </Card>
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>On-chain activity</h2>
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
