import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { FindOrderForm } from './FindOrderForm';

// Personalized (sends email based on submitted address) — never cached.
export const dynamic = 'force-dynamic';

export default function FindOrderPage() {
  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Find my order</h1>
        <p>
          Lost the link to your order? Enter the email you used at checkout and we&apos;ll resend
          the confirmation email(s), each with a link back to the order.
        </p>
        <Card>
          <FindOrderForm />
        </Card>
      </Stack>
    </PageContainer>
  );
}
