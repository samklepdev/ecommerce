import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { resolveCartOwner } from '@/app/lib/session';
import { repriceCartForDisplay } from '@/app/lib/cart-pricing';
import { removeFromCartAction } from '@/app/actions/cart';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TrashIcon } from '@/components/ui/TrashIcon';
import { CartLineQuantityStepper } from './CartLineQuantityStepper';
import styles from './page.module.css';

// Cart is personalized — never cached.
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const owner = await resolveCartOwner();
  const { getCart, getShippingRate, getProduct } = getContainer();
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

  const shipping = await getShippingRate.execute();

  const productsById = new Map(
    await Promise.all(
      cart.lines.map(
        async (line) =>
          [line.productId, await getProduct.execute({ productId: line.productId })] as const,
      ),
    ),
  );

  // Live catalogue prices, matching what `PlaceOrder` will actually charge —
  // see `cart-pricing.ts`. The map holds nulls for products that have gone, so
  // it's narrowed to the live ones first.
  const liveProducts = new Map(
    [...productsById].flatMap(([id, product]) => (product ? [[id, product] as const] : [])),
  );
  const priced = repriceCartForDisplay(cart.lines, liveProducts, 'USD');
  const subtotal = priced.subtotal;
  const total = subtotal.add(shipping);

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Your cart</h1>

        {priced.hasPriceChanges && (
          <p className={styles.priceNotice} role="status">
            Some prices changed since you added these items. The amounts shown are current.
          </p>
        )}

        <Stack gap={3}>
          {priced.lines.map((line) => {
            // A deleted/archived product still has an order-independent
            // cart line — fall back to the name snapshotted on the line.
            const product = productsById.get(line.productId) ?? null;
            return (
              <Card key={line.productId} className={styles.lineCard}>
                <div className={styles.lineInfo}>
                  {product?.imageUrl ? (
                    // Supplier image hosts are dynamic/admin-added, not known at build time.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={product.name} className={styles.lineImage} />
                  ) : (
                    <div className={styles.lineImagePlaceholder} aria-hidden />
                  )}
                  <div>
                    <p className={styles.name}>{line.name}</p>
                    <p className={styles.price}>
                      {line.lineTotal.toDisplayString()}
                      {line.previousUnitPrice && (
                        <span className={styles.wasPrice}>
                          {' '}
                          (was {line.previousUnitPrice.multiply(line.quantity).toDisplayString()})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className={styles.lineActions}>
                  <CartLineQuantityStepper productId={line.productId} quantity={line.quantity} />
                  <form action={removeFromCartAction}>
                    <input type="hidden" name="productId" value={line.productId} />
                    <Button type="submit" variant="ghost" iconOnly aria-label="Remove item">
                      <TrashIcon />
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </Stack>

        <Card className={styles.summary}>
          <div className={styles.priceLines}>
            <p className={styles.priceLine}>Subtotal: {subtotal.toDisplayString()}</p>
            <p className={styles.priceLine}>Shipping: {shipping.toDisplayString()}</p>
            <p className={styles.subtotal}>Total: {total.toDisplayString()}</p>
          </div>
          <Link href="/checkout">
            <Button>Checkout</Button>
          </Link>
        </Card>
      </Stack>
    </PageContainer>
  );
}
