import { Heading, Img, Text } from '@react-email/components';

import { EmailLayout, emailStyles } from '@/modules/notifications/application/emails/email-layout';
import { renderEmail, type RenderedEmail } from '@/modules/notifications/application/emails/render-email';

export interface WelcomeEmailTemplateInput {
  email: string;
  trackingUrl: string;
}

export function WelcomeEmail({ email, trackingUrl }: WelcomeEmailTemplateInput) {
  return (
    <EmailLayout preview="Your account is ready">
      <Heading style={emailStyles.heading}>Welcome</Heading>
      <Text style={emailStyles.paragraph}>Thanks for creating an account with {email}.</Text>
      <Text style={emailStyles.paragraph}>
        You can manage your profile, avatar and password from your account page any time.
      </Text>
      {/* The tracking pixel is the whole point of this email having a
          repository row: real clients load `<img>` by default (often after a
          "load images?" prompt), and that request is what flips the "opened"
          status server-side. Hidden rather than 1×1-in-the-corner so it can't
          show up as a stray dot. */}
      <Img src={trackingUrl} width="1" height="1" alt="" style={{ display: 'none' }} />
    </EmailLayout>
  );
}

/** Pure rendering — no infra imports, so it stays unit-testable without a
 * database or network, per this repo's use-case testing rule. */
export function renderWelcomeEmail(input: WelcomeEmailTemplateInput): Promise<RenderedEmail> {
  return renderEmail(<WelcomeEmail {...input} />);
}
