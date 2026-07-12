import Link from 'next/link';

import { getContainer } from '@/composition/container';

export const revalidate = 3600;

export default async function ProductsPage() {
  const { listProducts } = getContainer();
  const products = await listProducts.execute({});

  return (
    <main>
      <h1>Products</h1>
      {products.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        <ul>
          {products.map((product) => (
            <li key={product.id}>
              <Link href={`/products/${product.slug.value}`}>{product.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
