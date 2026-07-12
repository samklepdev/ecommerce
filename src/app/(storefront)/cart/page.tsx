import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { resolveCartOwner } from '@/app/lib/session';
import { removeFromCartAction } from '@/app/actions/cart';

// Cart is personalized — never cached.
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const owner = await resolveCartOwner();
  const { getCart } = getContainer();
  const cart = await getCart.execute({ owner });

  if (!cart || cart.isEmpty) {
    return (
      <main>
        <h1>Your cart</h1>
        <p>
          Your cart is empty. <Link href="/products">Browse products</Link>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Your cart</h1>
      <ul>
        {cart.lines.map((line) => (
          <li key={line.variantId}>
            {line.sku} × {line.quantity} — {line.subtotal.toString()}
            <form action={removeFromCartAction}>
              <input type="hidden" name="variantId" value={line.variantId} />
              <button type="submit">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <p>Subtotal: {cart.subtotal('USD').toString()}</p>
      <Link href="/checkout">Checkout</Link>
    </main>
  );
}
