import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { StoreClosed } from '@/app/(storefront)/StoreClosed';

import { SignUpForm } from './SignUpForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from '../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default async function SignUpPage() {
  // Paused with the rest of the customer-facing surface. Sign-in stays
  // reachable (admins need it); creating a new account, or asking for a
  // reset mail, does not.
  const { getStoreAvailability } = getContainer();
  if (!(await getStoreAvailability.execute()).isOpen) return <StoreClosed />;

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Sign up</h1>
        <Card className={styles.card}>
          <SignUpForm />
          <p className={styles.switchLink}>
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </Card>
      </Stack>
    </PageContainer>
  );
}
