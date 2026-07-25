import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';

// Static content, safe to cache indefinitely.
export const revalidate = 86400;

export default function PrivacyPolicyPage() {
  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Privacy Policy</h1>
        <Card>
          <p>
            <strong>Placeholder — replace this with your actual privacy policy before going
            live.</strong> This page exists so the footer link resolves to something rather
            than a 404; the text below is not a real policy and shouldn&apos;t be treated as
            legal advice or a binding commitment to customers.
          </p>
        </Card>
      </Stack>
    </PageContainer>
  );
}
