import { Heading, Link, Text } from '@react-email/components';

import { EmailLayout, emailStyles } from '@/modules/notifications/application/emails/email-layout';
import { renderEmail, type RenderedEmail } from '@/modules/notifications/application/emails/render-email';

export interface VerifyEmailTemplateInput {
  verifyUrl: string;
  expiresInMinutes: number;
}

export function VerifyEmail({ verifyUrl, expiresInMinutes }: VerifyEmailTemplateInput) {
  return (
    <EmailLayout
      preview="Verify your email address"
      footerNote="If you didn't create an account, you can safely ignore this email."
    >
      <Heading style={emailStyles.heading}>Verify your email</Heading>
      <Text style={emailStyles.paragraph}>
        Use the link below to verify your email address. It expires in {expiresInMinutes}{' '}
        minutes and can only be used once.
      </Text>
      {/* The URL is both the link text and the href, deliberately: a customer
          who can't or won't click can paste it, and a visible destination is
          also how someone spots a link that doesn't go where it claims. */}
      <Text style={emailStyles.paragraph}>
        <Link href={verifyUrl} style={emailStyles.link}>
          {verifyUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

/** Pure rendering — no infra imports, unit-testable without a database or
 * network. Mirrors `renderResetPasswordEmail`. */
export function renderVerifyEmail(input: VerifyEmailTemplateInput): Promise<RenderedEmail> {
  return renderEmail(<VerifyEmail {...input} />);
}
