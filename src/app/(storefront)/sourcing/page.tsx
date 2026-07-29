import { getSessionUser } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { InquiryForm } from './InquiryForm';
import styles from './page.module.css';

// The form posts and re-renders per visitor; nothing here is cacheable.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Source a product',
  description: 'Ask us to find something we don’t stock.',
};

export default async function SourcingPage() {
  const user = await getSessionUser();

  return (
    <PageContainer>
      <Stack gap={5}>
        <div>
          <h1>Can&apos;t find it?</h1>
          <p className={styles.lede}>
            We&apos;re a small catalog by choice, and we buy to order. If there&apos;s something
            you want that isn&apos;t listed, tell us what it is — if we can source it at a fair
            price, we will, and we&apos;ll reply either way.
          </p>
        </div>

        <InquiryForm kind="sourcing" defaultEmail={user?.email} submitLabel="Send request" />
      </Stack>
    </PageContainer>
  );
}
