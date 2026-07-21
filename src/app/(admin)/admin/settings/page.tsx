import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { ShippingRateEditor } from './ShippingRateEditor';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const { getShippingRate } = getContainer();
  const shippingRate = await getShippingRate.execute();

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Settings</h1>

        <Card className={styles.settingCard}>
          <div>
            <h2 className={styles.settingTitle}>Shipping</h2>
            <p className={styles.settingDescription}>
              A single flat rate charged once per order, regardless of what&apos;s in the cart.
            </p>
          </div>
          <ShippingRateEditor amountMinor={shippingRate.amountMinor} currency={shippingRate.currency} />
        </Card>
      </Stack>
    </PageContainer>
  );
}
