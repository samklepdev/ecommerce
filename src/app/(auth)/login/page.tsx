import Link from 'next/link';

import { getContainer } from '@/composition/container';

import { LoginForm } from './LoginForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import styles from '../auth-page.module.css';

export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<{ reset?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reset } = await searchParams;

  // The page stays reachable while the store is closed — it's the only
  // entrance to the admin console — but it says so, rather than letting a
  // customer type a correct password and be told something ambiguous.
  const { getStoreAvailability } = getContainer();
  const storeIsOpen = (await getStoreAvailability.execute()).isOpen;

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Log in</h1>
        <Card className={styles.card}>
          {reset === 'success' && (
            <Alert tone="success">Your password has been reset. Log in with your new password.</Alert>
          )}
          {!storeIsOpen && (
            <Alert tone="warning">
              The store is temporarily closed and customer sign-in is paused. Ordering will
              resume shortly.
            </Alert>
          )}
          <LoginForm />
          {storeIsOpen && (
            <>
              <p className={styles.switchLink}>
                <Link href="/forgot-password">Forgot password?</Link>
              </p>
              <p className={styles.switchLink}>
                Don&apos;t have an account? <Link href="/signup">Sign up</Link>
              </p>
            </>
          )}
        </Card>
      </Stack>
    </PageContainer>
  );
}
