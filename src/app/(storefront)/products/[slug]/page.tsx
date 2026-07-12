import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { addToCartAction } from '@/app/actions/cart';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export const revalidate = 3600;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { getProductBySlug } = getContainer();
  const product = await getProductBySlug.execute({ slug });
  if (!product) return { title: 'Product not found' };
  return { title: product.name, description: product.description ?? undefined };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const { getProductBySlug } = getContainer();
  const product = await getProductBySlug.execute({ slug });
  if (!product) notFound();

  return (
    <PageContainer>
      <Stack gap={5}>
        <div>
          <h1>{product.name}</h1>
          {product.description && <p className={styles.description}>{product.description}</p>}
        </div>

        <Stack gap={3}>
          {product.variants.map((variant) => (
            <Card key={variant.id} className={styles.variantCard}>
              <div>
                <p className={styles.variantName}>{variant.name}</p>
                <p className={styles.price}>{variant.price.toString()}</p>
              </div>
              <form action={addToCartAction}>
                <input type="hidden" name="variantId" value={variant.id} />
                <input type="hidden" name="quantity" value="1" />
                <Button type="submit">Add to cart</Button>
              </form>
            </Card>
          ))}
        </Stack>
      </Stack>
    </PageContainer>
  );
}
