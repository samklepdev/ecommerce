import { VerifyEmailForm } from './VerifyEmailForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from '../../auth-page.module.css';

export const dynamic = 'force-dynamic';

interface VerifyEmailPageProps {
  params: Promise<{ token: string }>;
}

export default async function VerifyEmailPage({ params }: VerifyEmailPageProps) {
  const { token } = await params;

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Verify your email</h1>
        <Card className={styles.card}>
          <VerifyEmailForm token={token} />
        </Card>
      </Stack>
    </PageContainer>
  );
}
