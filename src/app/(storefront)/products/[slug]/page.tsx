import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { addToCartAction } from '@/app/actions/cart';

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
    <main>
      <h1>{product.name}</h1>
      {product.description && <p>{product.description}</p>}

      <ul>
        {product.variants.map((variant) => (
          <li key={variant.id}>
            {variant.name} — {variant.price.toString()}
            <form action={addToCartAction}>
              <input type="hidden" name="variantId" value={variant.id} />
              <input type="hidden" name="quantity" value="1" />
              <button type="submit">Add to cart</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
