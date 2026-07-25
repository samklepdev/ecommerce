import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { Money } from '@/shared/domain/money';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { CreateCouponForm } from './CreateCouponForm';
import { CouponRow } from './CouponRow';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function discountDisplay(coupon: { discountType: string; percentageValue: number | null; fixedAmountMinor: number | null; currency: string | null }): string {
  if (coupon.discountType === 'percentage') return `${coupon.percentageValue}% off`;
  return `${Money.of(coupon.fixedAmountMinor ?? 0, coupon.currency ?? 'USD').toDisplayString()} off`;
}

export default async function AdminCouponsPage() {
  await requireAdmin();

  const { listCoupons } = getContainer();
  const coupons = await listCoupons.execute();

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Coupons</h1>

        <Card>
          <CreateCouponForm />
        </Card>

        {coupons.length === 0 ? (
          <p className={styles.empty}>No coupons yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <CouponRow
                    key={c.id}
                    id={c.id}
                    code={c.code}
                    discountDisplay={discountDisplay(c)}
                    isActive={c.isActive}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>
    </PageContainer>
  );
}
