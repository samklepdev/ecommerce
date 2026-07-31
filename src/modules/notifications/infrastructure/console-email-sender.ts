import { logger } from '@/shared/infrastructure/logger';
import type { EmailMessage, EmailSender } from '@/modules/notifications/application/ports/email-sender';

/**
 * Development stand-in used when `RESEND_API_KEY` is unset. It sends
 * nothing — it logs that an email would have gone out, so local work can
 * exercise the flows (including the welcome email's tracking pixel) without
 * a provider account.
 *
 * The rendered HTML is logged **only outside production**. That body carries
 * password-reset and email-verification links, which are bearer tokens: one
 * log line is enough to take over an account, and logs are routinely shipped
 * to third-party aggregators. In production this logs recipient and subject
 * and nothing else — and the startup warning says plainly that mail is not
 * being delivered, because a silent stub in production is how customers stop
 * receiving order confirmations without anyone noticing.
 */
export class ConsoleEmailSender implements EmailSender {
  constructor() {
    if (process.env.NODE_ENV === 'production') {
      logger.warn(
        'RESEND_API_KEY is not set — outbound email is being logged, NOT delivered. ' +
          'Password resets and order confirmations will not reach customers.',
      );
    }
  }

  async send({ to, subject, html }: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      logger.info('email: not sent (no provider configured)', { to, subject });
      return;
    }
    // The HTML only, and only outside production. The text part would carry
    // the same bearer-token links, so logging both just doubles the exposure
    // for no extra diagnostic value.
    logger.info('email: sent (stub)', { to, subject, html });
  }
}
