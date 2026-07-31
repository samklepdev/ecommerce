import { Heading, Link, Text } from '@react-email/components';

import { EmailLayout, emailStyles } from '@/modules/notifications/application/emails/email-layout';
import { renderEmail, type RenderedEmail } from '@/modules/notifications/application/emails/render-email';

export interface ResetPasswordEmailTemplateInput {
  resetUrl: string;
  expiresInMinutes: number;
}

export function ResetPasswordEmail({
  resetUrl,
  expiresInMinutes,
}: ResetPasswordEmailTemplateInput) {
  return (
    <EmailLayout
      preview="Reset your password"
      footerNote="If you didn't request this, you can safely ignore this email — your password won't change."
    >
      <Heading style={emailStyles.heading}>Reset your password</Heading>
      <Text style={emailStyles.paragraph}>
        Use the link below to choose a new password. It expires in {expiresInMinutes} minutes
        and can only be used once.
      </Text>
      {/* Link text is the URL itself — see the note in the verify template. */}
      <Text style={emailStyles.paragraph}>
        <Link href={resetUrl} style={emailStyles.link}>
          {resetUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

/** Pure rendering — no infra imports, unit-testable without a database or
 * network. */
export function renderResetPasswordEmail(
  input: ResetPasswordEmailTemplateInput,
): Promise<RenderedEmail> {
  return renderEmail(<ResetPasswordEmail {...input} />);
}
