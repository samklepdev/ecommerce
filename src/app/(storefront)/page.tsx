import Link from 'next/link';

// Home: read-heavy, rarely changes.
export const revalidate = 3600;

export default function HomePage() {
  return (
    <main>
      <h1>Storefront</h1>
      <p>Pay with non-custodial on-chain Bitcoin — no card rails, no processor.</p>
      <Link href="/products">Browse products</Link>
    </main>
  );
}
