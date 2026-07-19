import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';

export const revalidate = 3600;

export default async function ProductsPage() {
  const { listProducts } = getContainer();
  const products = await listProducts.execute({});

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Products</h1>
        {products.length === 0 ? (
          <p className={styles.empty}>No products yet.</p>
        ) : (
          <div className={styles.grid}>
            {products.map((product) => (
              <Link key={product.id} href={`/products/${product.slug.value}`}>
                <Card className={styles.productCard}>
                  {product.imageUrl ? (
                    <div className={styles.imageStack}>
                      {/* Supplier image hosts are dynamic/admin-added, not known at build time. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={product.imageUrl} alt={product.name} className={styles.image} />
                      {product.hoverImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.hoverImageUrl}
                          alt=""
                          aria-hidden
                          className={styles.hoverImage}
                        />
                      )}
                    </div>
                  ) : (
                    <div className={styles.imagePlaceholder} aria-hidden />
                  )}
                  <span>{product.name}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Stack>
    </PageContainer>
  );
}
