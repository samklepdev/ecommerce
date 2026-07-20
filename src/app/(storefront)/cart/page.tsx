import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { resolveCartOwner } from '@/app/lib/session';
import { removeFromCartAction } from '@/app/actions/cart';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CartLineQuantityStepper } from './CartLineQuantityStepper';
import styles from './page.module.css';

// Cart is personalized — never cached.
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const owner = await resolveCartOwner();
  const { getCart } = getContainer();
  const cart = await getCart.execute({ owner });

  if (!cart || cart.isEmpty) {
    return (
      <PageContainer>
        <Stack gap={4}>
          <h1>Your cart</h1>
          <p>
            Your cart is empty.{' '}
            <Link href="/products">
              <Button variant="secondary">Browse products</Button>
            </Link>
          </p>
        </Stack>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Your cart</h1>

        <Stack gap={3}>
          {cart.lines.map((line) => (
            <Card key={line.variantId} className={styles.lineCard}>
              <div>
                <p className={styles.sku}>{line.sku}</p>
                <p className={styles.qty}>{line.subtotal.toDisplayString()}</p>
              </div>
              <CartLineQuantityStepper variantId={line.variantId} quantity={line.quantity} />
              <form action={removeFromCartAction}>
                <input type="hidden" name="variantId" value={line.variantId} />
                <Button type="submit" variant="ghost">
                  Remove
                </Button>
              </form>
            </Card>
          ))}
        </Stack>

        <Card className={styles.summary}>
          <p className={styles.subtotal}>Subtotal: {cart.subtotal('USD').toDisplayString()}</p>
          <Link href="/checkout">
            <Button>Checkout</Button>
          </Link>
        </Card>
      </Stack>
    </PageContainer>
  );
}
