import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { paymentStatusTone, fulfillmentStatusTone } from '@/app/lib/status-tone';
import { Money } from '@/shared/domain/money';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PromoteUserButton } from './PromoteUserButton';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminUsersPageProps {
  searchParams: Promise<{ email?: string }>;
}

/** Exact-email lookup + promote — not a full customer list/search. Browsing
 * or searching all customers would need a new paginated repository method;
 * out of scope here. */
export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  await requireAdmin();
  const { email } = await searchParams;

  const { findUserByEmailForAdmin, listOrdersForCustomer } = getContainer();

  const profile = email ? await findUserByEmailForAdmin.execute({ email }) : null;
  const orders = profile ? await listOrdersForCustomer.execute({ userId: profile.id }) : [];

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Users</h1>

        <form className={styles.searchForm}>
          <Input type="text" name="email" defaultValue={email} placeholder="Look up by exact email" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {email && !profile && <p className={styles.empty}>No account found for that email.</p>}

        {profile && (
          <Card className={styles.profileCard}>
            <div className={styles.profileHeader}>
              <div>
                <p className={styles.profileEmail}>{profile.email}</p>
                <Badge tone={profile.role === 'admin' ? 'accent' : 'neutral'}>{profile.role}</Badge>
              </div>
              {profile.role !== 'admin' && <PromoteUserButton email={profile.email} />}
            </div>

            <h2 className={styles.sectionTitle}>Orders ({orders.length})</h2>
            {orders.length === 0 ? (
              <p className={styles.empty}>No orders yet.</p>
            ) : (
              <ul className={styles.orderList}>
                {orders.map((order) => (
                  <li key={order.id}>
                    <Link href={`/admin/orders/${order.id}`} className={styles.orderRow}>
                      <span>{order.id.slice(0, 8)}</span>
                      <span>{order.createdAt.toLocaleDateString()}</span>
                      <span>{Money.of(order.amountMinor, order.currency).toDisplayString()}</span>
                      <Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                      <Badge tone={fulfillmentStatusTone(order.fulfillmentStatus)}>
                        {order.fulfillmentStatus}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </Stack>
    </PageContainer>
  );
}
