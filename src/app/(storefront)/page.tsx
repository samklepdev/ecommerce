import Link from 'next/link';

import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// Home: read-heavy, rarely changes.
export const revalidate = 3600;

export default function HomePage() {
  return (
    <PageContainer>
      <Card>
        <Stack gap={4}>
          <h1>Storefront</h1>
          <p>Pay with non-custodial on-chain Bitcoin — no card rails, no processor.</p>
          <div>
            <Link href="/products">
              <Button>Browse products</Button>
            </Link>
          </div>
        </Stack>
      </Card>
    </PageContainer>
  );
}
