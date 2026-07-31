import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

/**
 * The shell every outbound email shares.
 *
 * Deliberately plain: system fonts, black on white, left aligned, one hairline
 * rule above a small footer. No logo, wordmark or colour — branding is the
 * operator's to add, and this is the single place to add it.
 *
 * Styles are inline objects rather than a stylesheet because that is what
 * email clients actually support; Gmail strips `<style>` in some contexts and
 * Outlook's renderer ignores most of what it doesn't strip. `@react-email`'s
 * components exist to paper over those differences, which is the other half of
 * why this replaced hand-written HTML strings.
 */
const body = {
  backgroundColor: '#ffffff',
  color: '#111111',
  // A stack rather than a webfont: a font that fails to load in Outlook falls
  // back to Times, which looks like a mistake.
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontSize: '16px',
  lineHeight: '1.6',
};

const container = {
  margin: '0 auto',
  padding: '32px 24px 40px',
  maxWidth: '560px',
};

const rule = {
  borderColor: '#e5e5e5',
  margin: '32px 0 16px',
};

const footer = {
  color: '#6b6b6b',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
};

export interface EmailLayoutProps {
  /**
   * The preview line — what a mail client shows next to the subject. Set it
   * per email: left unset, clients scrape the first words of the body, which
   * for a receipt is usually "Thanks for your order" repeated back.
   */
  preview: string;
  children: ReactNode;
  /** Small print under the rule. Omitted entirely when there's none, rather
   * than leaving an empty rule with nothing beneath it. */
  footerNote?: ReactNode;
}

export function EmailLayout({ preview, children, footerNote }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {children}
          {footerNote ? (
            <Section>
              <Hr style={rule} />
              <Text style={footer}>{footerNote}</Text>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

/** Shared type scale, so six templates don't each invent their own. */
export const emailStyles = {
  heading: {
    color: '#111111',
    fontSize: '22px',
    fontWeight: 600,
    lineHeight: '1.3',
    margin: '0 0 16px',
  },
  paragraph: { margin: '0 0 16px' },
  /** For an order id or total — the bits someone reads back over the phone. */
  detail: { margin: '0 0 4px' },
  link: { color: '#111111', textDecoration: 'underline' },
  list: { margin: '0 0 16px', paddingLeft: '20px' },
} as const;
