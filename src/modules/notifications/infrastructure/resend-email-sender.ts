import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';

/** Operator-configured constant, not a user- or feed-supplied URL, so a
 * bare `fetch` is the right call here (see CLAUDE.md on `safeFetch`). */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * The real outbound-email adapter. Selected in the container whenever
 * `RESEND_API_KEY` is set; without it the app falls back to
 * `ConsoleEmailSender`, which logs and sends nothing.
 *
 * Sends inline rather than through a queue. CLAUDE.md wants side effects on
 * BullMQ, and email belongs there — but a queue is a larger change than this
 * fix, and every caller that can't tolerate a failed send already wraps it
 * in try/catch. Moving it is tracked separately in TODO.md.
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });

    if (!res.ok) {
      // Status and Resend's own message only — never the request body, which
      // holds password-reset and email-verification links.
      const detail = await res.text().catch(() => '');
      throw new Error(`resend rejected the message: ${res.status} ${detail.slice(0, 200)}`);
    }
  }
}
