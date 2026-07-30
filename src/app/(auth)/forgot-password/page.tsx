import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { StoreClosed } from '@/app/(storefront)/StoreClosed';

import { ForgotPasswordForm } from './ForgotPasswordForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from '../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default async function ForgotPasswordPage() {
  // Paused with the rest of the customer-facing surface. Sign-in stays
  // reachable (admins need it); creating a new account, or asking for a
  // reset mail, does not.
  const { getStoreAvailability } = getContainer();
  if (!(await getStoreAvailability.execute()).isOpen) return <StoreClosed />;

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Forgot password</h1>
        <Card className={styles.card}>
          <ForgotPasswordForm />
          <p className={styles.switchLink}>
            <Link href="/login">Back to log in</Link>
          </p>
        </Card>
      </Stack>
    </PageContainer>
  );
}
