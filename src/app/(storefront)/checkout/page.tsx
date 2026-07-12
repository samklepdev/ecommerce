import { CheckoutForm } from './CheckoutForm';

// Checkout is personalized and mutates state — never cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function CheckoutPage() {
  return (
    <main>
      <h1>Checkout</h1>
      <CheckoutForm />
    </main>
  );
}
