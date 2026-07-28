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
import { DemoteAdminButton } from './DemoteAdminButton';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminUsersPageProps {
  searchParams: Promise<{ email?: string }>;
}

/** Exact-email lookup + promote — not a full customer list/search. Browsing
 * or searching all customers would need a new paginated repository method;
 * out of scope here. */
/** How many of a customer's orders the profile card shows before deferring
 * to the full list. */
const RECENT_ORDER_COUNT = 10;

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const viewer = await requireAdmin();
  const { email } = await searchParams;

  const { findUserByEmailForAdmin, listOrdersForCustomer } = getContainer();

  const profile = email ? await findUserByEmailForAdmin.execute({ email }) : null;
  // Bounded on purpose: this is a summary on a profile card, not the order
  // list. The full, searchable one is /admin/orders — linked below when
  // there's more than fits here.
  const orders = profile
    ? await listOrdersForCustomer.execute({ userId: profile.id, page: 1, pageSize: RECENT_ORDER_COUNT })
    : { items: [], totalItems: 0, page: 1, totalPages: 1 };

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
              {profile.role === 'admin' && profile.id !== viewer.id && (
                <DemoteAdminButton email={profile.email} />
              )}
            </div>

            <h2 className={styles.sectionTitle}>Orders ({orders.totalItems})</h2>
            {orders.totalItems === 0 ? (
              <p className={styles.empty}>No orders yet.</p>
            ) : (
              <ul className={styles.orderList}>
                {orders.items.map((order) => (
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
            {orders.totalItems > orders.items.length && (
              <p className={styles.empty}>
                Showing the {orders.items.length} most recent.{' '}
                <Link href={`/admin/orders?email=${encodeURIComponent(profile.email)}`}>
                  See all {orders.totalItems} orders →
                </Link>
              </p>
            )}
          </Card>
        )}
      </Stack>
    </PageContainer>
  );
}
