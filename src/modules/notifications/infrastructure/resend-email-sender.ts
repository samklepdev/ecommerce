import type { EmailMessage, EmailSender } from '@/modules/notifications/application/ports/email-sender';

/** Operator-configured constant, not a user- or feed-supplied URL, so a
 * bare `fetch` is the right call here (see CLAUDE.md on `safeFetch`). */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * The real outbound-email adapter. Selected in the container whenever
 * `RESEND_API_KEY` is set; without it the app falls back to
 * `ConsoleEmailSender`, which logs and sends nothing.
 *
 * Called from a BullMQ job rather than the request path, so a failure here
 * throws and is retried by the worker (five attempts, exponential backoff)
 * instead of being swallowed by the caller.
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send({ to, subject, html, text }: EmailMessage): Promise<void> {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      // `text` is omitted rather than sent empty when absent: Resend treats a
      // present-but-blank text part as the alternative and some clients then
      // show a blank message.
      body: JSON.stringify({ from: this.from, to, subject, html, ...(text ? { text } : {}) }),
    });

    if (!res.ok) {
      // Status and Resend's own message only — never the request body, which
      // holds password-reset and email-verification links.
      const detail = await res.text().catch(() => '');
      throw new Error(`resend rejected the message: ${res.status} ${detail.slice(0, 200)}`);
    }
  }
}
