import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SaveButton } from '../../products/SaveButton';
import { AddToCartButton } from './AddToCartButton';
import styles from './page.module.css';

// Personal, and changes the moment a heart is pressed.
export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { listWishlist } = getContainer();
  const items = await listWishlist.execute({ userId: user.id });

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.head}>
          <h1>Saved products</h1>
          <Link href="/account" className={styles.backLink}>
            ← Back to account
          </Link>
        </div>

        {items.length === 0 ? (
          <Card className={styles.empty}>
            <p>You haven&apos;t saved anything yet.</p>
            <p className={styles.emptyHint}>
              The heart on any product keeps it here — handy for deciding later without holding
              a checkout open.
            </p>
            <Link href="/products">
              <Button>Browse products</Button>
            </Link>
          </Card>
        ) : (
          <ul className={styles.list}>
            {items.map(({ product, savedAt }) => (
              <li key={product.id}>
                <Card className={styles.item}>
                  <Link href={`/products/${product.slug.value}`} className={styles.itemLink}>
                    {product.imageUrl ? (
                      // Supplier image hosts are admin-added, not known at build time.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt="" className={styles.image} />
                    ) : (
                      <div className={styles.imagePlaceholder} aria-hidden />
                    )}
                    <span className={styles.text}>
                      <span className={styles.name}>{product.name}</span>
                      <span className={styles.meta}>
                        Saved {savedAt.toLocaleDateString()}
                        {product.category ? ` · ${product.category}` : ''}
                      </span>
                    </span>
                  </Link>

                  <span className={styles.price}>{product.price.toDisplayString()}</span>

                  <span className={styles.actions}>
                    <AddToCartButton productId={product.id} productName={product.name} />
                    <SaveButton
                      productId={product.id}
                      productName={product.name}
                      initialSaved
                      isLoggedIn
                    />
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Stack>
    </PageContainer>
  );
}
