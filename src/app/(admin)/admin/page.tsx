import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireAdmin();

  const { listUnfulfillableOrderLines, listSupplierOrdersNeedingAction, listAllOrdersForAdmin } =
    getContainer();

  const [unfulfillableLines, supplierOrdersNeedingAction, allOrders] = await Promise.all([
    listUnfulfillableOrderLines.execute(),
    listSupplierOrdersNeedingAction.execute(),
    listAllOrdersForAdmin.execute({}),
  ]);

  const awaitingConfirmationCount = allOrders.filter(
    (o) => o.paymentStatus === 'awaiting_confirmation',
  ).length;
  const recoveredCount = allOrders.filter((o) => o.paymentRecoveredFrom !== null).length;

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Dashboard</h1>

        <div className={styles.metricsGrid}>
          <Link href="/admin/fulfillment" className={styles.metricLink}>
            <Card className={styles.metricCard}>
              <span className={styles.metricValue}>{unfulfillableLines.length}</span>
              <span className={styles.metricLabel}>Unsourced order lines</span>
            </Card>
          </Link>
          <Link href="/admin/fulfillment" className={styles.metricLink}>
            <Card className={styles.metricCard}>
              <span className={styles.metricValue}>{supplierOrdersNeedingAction.length}</span>
              <span className={styles.metricLabel}>Supplier orders needing action</span>
            </Card>
          </Link>
          <Link href="/admin/orders" className={styles.metricLink}>
            <Card className={styles.metricCard}>
              <span className={styles.metricValue}>{awaitingConfirmationCount}</span>
              <span className={styles.metricLabel}>Orders awaiting confirmation</span>
            </Card>
          </Link>
          <Link href="/admin/orders" className={styles.metricLink}>
            <Card className={styles.metricCard}>
              <span className={styles.metricValue}>{recoveredCount}</span>
              <span className={styles.metricLabel}>Recovered orders needing review</span>
            </Card>
          </Link>
        </div>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Quick links</h2>
          <div className={styles.linksRow}>
            <Link href="/admin/products">Products</Link>
            <Link href="/admin/fulfillment">Fulfillment</Link>
            <Link href="/admin/orders">Orders</Link>
            <Link href="/admin/users">Users</Link>
            <Link href="/admin/settings">Settings</Link>
            <Link href="/admin/audit-log">Audit log</Link>
          </div>
        </Card>
      </Stack>
    </PageContainer>
  );
}
