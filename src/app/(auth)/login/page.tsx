import Link from 'next/link';

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

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Log in</h1>
        <Card className={styles.card}>
          {reset === 'success' && (
            <Alert tone="success">Your password has been reset. Log in with your new password.</Alert>
          )}
          <LoginForm />
          <p className={styles.switchLink}>
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
          <p className={styles.switchLink}>
            Don&apos;t have an account? <Link href="/signup">Sign up</Link>
          </p>
        </Card>
      </Stack>
    </PageContainer>
  );
}
