import Link from 'next/link';

import { LoginForm } from './LoginForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from '../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Log in</h1>
        <Card className={styles.card}>
          <LoginForm />
          <p className={styles.switchLink}>
            Don&apos;t have an account? <Link href="/signup">Sign up</Link>
          </p>
        </Card>
      </Stack>
    </PageContainer>
  );
}
