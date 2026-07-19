import Link from 'next/link';

import { ForgotPasswordForm } from './ForgotPasswordForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from '../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
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
