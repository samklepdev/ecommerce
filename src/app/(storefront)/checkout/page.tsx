import { CheckoutForm } from './CheckoutForm';
import { getContainer } from '@/composition/container';
import { resolveCartOwner } from '@/app/lib/session';
import { Money } from '@/shared/domain/money';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';

// Checkout is personalized and mutates state — never cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function CheckoutPage() {
  const owner = await resolveCartOwner();
  const { getCart, getShippingRate } = getContainer();
  const cart = await getCart.execute({ owner });
  const shipping = await getShippingRate.execute();
  const subtotal = cart?.subtotal('USD') ?? Money.zero('USD');
  const total = subtotal.add(shipping);

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Checkout</h1>
        <Card className={styles.summary}>
          <p className={styles.priceLine}>Subtotal: {subtotal.toDisplayString()}</p>
          <p className={styles.priceLine}>Shipping: {shipping.toDisplayString()}</p>
          <p className={styles.total}>Total: {total.toDisplayString()}</p>
        </Card>
        <CheckoutForm />
      </Stack>
    </PageContainer>
  );
}
