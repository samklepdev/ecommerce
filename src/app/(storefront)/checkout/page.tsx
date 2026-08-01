import { redirect } from 'next/navigation';

import { CheckoutForm } from './CheckoutForm';
import { getContainer } from '@/composition/container';
import { getSessionUser, resolveCartOwner } from '@/app/lib/session';
import { repriceCartForDisplay } from '@/app/lib/cart-pricing';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

// Checkout is personalized and mutates state — never cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function CheckoutPage() {
  const owner = await resolveCartOwner();
  const {
    getCart,
    getShippingRate,
    listSavedAddresses,
    getProductsByIds,
    getSourceableOfferForProduct,
  } = getContainer();
  const cart = await getCart.execute({ owner });
  if (!cart || cart.isEmpty) redirect('/cart');

  const shipping = await getShippingRate.execute();

  const user = await getSessionUser();
  const savedAddresses = user ? await listSavedAddresses.execute({ userId: user.id }) : [];

  // One query for the whole summary; the cart line carries a name snapshot,
  // used when a product has since gone.
  const products = await getProductsByIds.execute({
    productIds: cart.lines.map((line) => line.productId),
  });
  const productById = new Map(products.map((p) => [p.id, p] as const));

  /**
   * Priced against the live catalogue, not the cart's snapshot.
   *
   * `PlaceOrder` re-reads the catalogue and charges the current price, so
   * showing the add-to-cart price here meant a customer could authorise one
   * amount and have satoshis quoted for another — irreversibly, with no refund
   * mechanism. This page now reads from the same source the charge comes from.
   */
  /**
   * Which lines can actually be bought — the same rule `PlaceOrder` enforces.
   * Without it the summary showed a withdrawn item as perfectly normal and the
   * refusal came only after the address form, naming no item.
   */
  const unsellableProductIds = new Set(
    (
      await Promise.all(
        cart.lines.map(async (line) => {
          const offer = await getSourceableOfferForProduct.execute({ productId: line.productId });
          return offer?.isAvailable ? null : line.productId;
        }),
      )
    ).filter((id): id is string => id !== null),
  );

  const priced = repriceCartForDisplay(cart.lines, productById, 'USD', unsellableProductIds);
  const subtotal = priced.subtotal;
  const total = subtotal.add(shipping);

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Checkout</h1>

        <div className={styles.layout}>
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

          <div className={styles.summaryColumn}>
            <Card className={styles.summary}>
              <h2 className={styles.summaryTitle}>Your order</h2>

              {/* The items, with their pictures. Checkout used to show three
                  numbers and no indication of what was being bought. */}
              {/* Called out before the customer commits, never applied
                  silently — this is the amount they are about to send. */}
              {priced.hasPriceChanges && (
                <Alert tone="warning">
                  Some prices changed since you added these items. The amounts below are
                  current, and they are what you will be charged.
                </Alert>
              )}
              {priced.hasUnavailable && (
                <Alert tone="danger">
                  An item is no longer available. Remove it from your cart to continue.
                </Alert>
              )}

              <ul className={styles.lines}>
                {priced.lines.map((line) => {
                  const product = productById.get(line.productId);
                  return (
                    <li key={line.productId} className={styles.line}>
                      {product?.imageUrl ? (
                        // Supplier image hosts are admin-added, not known at build time.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className={styles.lineImage}
                        />
                      ) : (
                        <div className={styles.lineImagePlaceholder} aria-hidden />
                      )}
                      <span className={styles.lineText}>
                        <span className={styles.lineName}>{line.name}</span>
                        <span className={styles.lineMeta}>
                          {line.unitPrice.toDisplayString()} × {line.quantity}
                          {line.previousUnitPrice && (
                            <span className={styles.wasPrice}>
                              {' '}
                              (was {line.previousUnitPrice.toDisplayString()})
                            </span>
                          )}
                          {line.unavailable && (
                            <span className={styles.unavailableNote}> — no longer available</span>
                          )}
                        </span>
                      </span>
                      <span className={styles.lineAmount}>{line.lineTotal.toDisplayString()}</span>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.divider} />

              <p className={styles.priceLine}>
                <span>Subtotal</span>
                <span>{subtotal.toDisplayString()}</span>
              </p>
              <p className={styles.priceLine}>
                <span>Shipping</span>
                <span>{shipping.toDisplayString()}</span>
              </p>
              <p className={styles.total}>
                <span>Total</span>
                <span>{total.toDisplayString()}</span>
              </p>
            </Card>
          </div>
        </div>
      </Stack>
    </PageContainer>
  );
}
