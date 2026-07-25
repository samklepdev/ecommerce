import { redirect } from 'next/navigation';

import { CheckoutForm } from './CheckoutForm';
import { getContainer } from '@/composition/container';
import { getSessionUser, resolveCartOwner } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';

// Checkout is personalized and mutates state — never cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function CheckoutPage() {
  const owner = await resolveCartOwner();
  const { getCart, getShippingRate, listSavedAddresses } = getContainer();
  const cart = await getCart.execute({ owner });
  if (!cart || cart.isEmpty) redirect('/cart');

  const shipping = await getShippingRate.execute();
  const subtotal = cart.subtotal('USD');
  const total = subtotal.add(shipping);

  const user = await getSessionUser();
  const savedAddresses = user ? await listSavedAddresses.execute({ userId: user.id }) : [];

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Checkout</h1>
        <Card className={styles.summary}>
          <p className={styles.priceLine}>Subtotal: {subtotal.toDisplayString()}</p>
          <p className={styles.priceLine}>Shipping: {shipping.toDisplayString()}</p>
          <p className={styles.total}>Total: {total.toDisplayString()}</p>
        </Card>
        <CheckoutForm
          isLoggedIn={!!user}
          userEmail={user?.email}
          savedAddresses={savedAddresses.map((a) => ({
            id: a.id,
            name: a.name,
            line1: a.line1,
            line2: a.line2,
            city: a.city,
            region: a.region,
            postalCode: a.postalCode,
            country: a.country,
          }))}
        />
      </Stack>
    </PageContainer>
  );
}
