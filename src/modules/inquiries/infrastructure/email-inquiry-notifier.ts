import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import type {
  Inquiry,
  InquiryNotifier,
} from '@/modules/inquiries/application/ports/inquiry-repository';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Emails the shop when a customer asks us to source something.
 *
 * Every field here is customer-supplied and lands in an HTML email, so all
 * of it is escaped — this is the one place in the app where a stranger's
 * free text is composed into markup by hand rather than rendered by React.
 */
export class EmailInquiryNotifier implements InquiryNotifier {
  constructor(
    private readonly emailSender: EmailSender,
    private readonly supportEmail: string,
    private readonly appUrl: string,
  ) {}

  async notifyNewInquiry(inquiry: Inquiry): Promise<void> {
    const html = `
      <h2>Sourcing request</h2>
      <p><strong>${escapeHtml(inquiry.subject)}</strong></p>
      <p style="white-space:pre-wrap">${escapeHtml(inquiry.message)}</p>
      <hr />
      <p>From: ${escapeHtml(inquiry.customerEmail)}${inquiry.userId ? ' (signed in)' : ''}</p>
      <p><a href="${this.appUrl}/admin/inquiries">Open the inquiry queue</a></p>
    `.trim();

    // Reply-to isn't available through the EmailSender port, so the sender's
    // address is in the body — the admin copies it to reply. Worth revisiting
    // if the port ever grows headers.
    await this.emailSender.send(
      this.supportEmail,
      `Sourcing request: ${inquiry.subject}`,
      html,
    );
  }
}
