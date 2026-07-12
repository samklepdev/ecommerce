import { CheckoutForm } from './CheckoutForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';

// Checkout is personalized and mutates state — never cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function CheckoutPage() {
  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Checkout</h1>
        <CheckoutForm />
      </Stack>
    </PageContainer>
  );
}
