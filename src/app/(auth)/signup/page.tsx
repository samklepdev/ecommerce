import Link from 'next/link';

import { SignUpForm } from './SignUpForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from '../auth-page.module.css';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
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
