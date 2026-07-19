import { logger } from '@/shared/infrastructure/logger';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';

/** Stand-in for a real provider (SMTP/Resend/Postmark/etc.) — none is wired
 * up yet, and there's no BullMQ queue installed to send it off the request
 * path either, despite CLAUDE.md's "async side effects run on BullMQ" note.
 * This is a deliberate v1 scope decision, not an oversight: it just logs the
 * rendered email so the tracking-pixel mechanism (the actual point of this
 * feature) can be exercised end-to-end without a real provider account. */
export class ConsoleEmailSender implements EmailSender {
  async send(to: string, subject: string, html: string): Promise<void> {
    logger.info('email: sent (stub)', { to, subject, html });
  }
}
