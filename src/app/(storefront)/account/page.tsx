import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { AccountAvatarUploader } from './AccountAvatarUploader';
import { ChangePasswordForm } from './ChangePasswordForm';
import { ChangeEmailForm } from './ChangeEmailForm';
import { DeleteAccountForm } from './DeleteAccountForm';
import { ResendVerificationButton } from './ResendVerificationButton';
import { SavedAddressCard } from './SavedAddressCard';
import { AddSavedAddressForm } from './AddSavedAddressForm';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { getAccountProfile, getWelcomeEmailStatus, listSavedAddresses } = getContainer();
  const [profile, welcomeEmail, savedAddresses] = await Promise.all([
    getAccountProfile.execute({ userId: user.id }),
    getWelcomeEmailStatus.execute({ userId: user.id }),
    listSavedAddresses.execute({ userId: user.id }),
  ]);

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Account</h1>

        {!user.isEmailVerified && (
          <Card className={styles.section}>
            <Alert tone="neutral">Please verify your email address.</Alert>
            <ResendVerificationButton />
          </Card>
        )}

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Profile</h2>
          <AccountAvatarUploader avatarUrl={profile?.avatarUrl ?? null} email={user.email} />
          <p className={styles.meta}>{user.email}</p>
          {profile && (
            <p className={styles.meta}>
              Member since {profile.createdAt.toLocaleDateString()}
            </p>
          )}
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Welcome email</h2>
          <div className={styles.welcomeStatus}>
            {!welcomeEmail.sent && <Badge tone="neutral">Not sent</Badge>}
            {welcomeEmail.sent && welcomeEmail.opened && (
              <Badge tone="success">
                Opened {welcomeEmail.openedAt?.toLocaleString()}
              </Badge>
            )}
            {welcomeEmail.sent && !welcomeEmail.opened && <Badge tone="neutral">Not opened yet</Badge>}
          </div>
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Change email</h2>
          <ChangeEmailForm />
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Change password</h2>
          <ChangePasswordForm />
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Addresses</h2>
          {savedAddresses.length === 0 ? (
            <p className={styles.meta}>No saved addresses yet.</p>
          ) : (
            savedAddresses.map((a) => (
              <SavedAddressCard
                key={a.id}
                id={a.id}
                name={a.name}
                line1={a.line1}
                line2={a.line2}
                city={a.city}
                region={a.region}
                postalCode={a.postalCode}
                country={a.country}
                isDefault={a.isDefault}
              />
            ))
          )}
          <AddSavedAddressForm />
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Orders</h2>
          <Link href="/account/orders">View order history →</Link>
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Delete account</h2>
          <p className={styles.meta}>
            This permanently deletes your account. Your past orders are kept for records but are no
            longer linked to an account.
          </p>
          <DeleteAccountForm />
        </Card>
      </Stack>
    </PageContainer>
  );
}
