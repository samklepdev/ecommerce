import { ResetPasswordForm } from './ResetPasswordForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import styles from '../../auth-page.module.css';

export const dynamic = 'force-dynamic';

interface ResetPasswordPageProps {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params;

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Reset password</h1>
        <Card className={styles.card}>
          <ResetPasswordForm token={token} />
        </Card>
      </Stack>
    </PageContainer>
  );
}
