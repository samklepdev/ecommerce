import type { UseCase } from '@/shared/application/use-case';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';
import {
  renderOrderConfirmationEmail,
  type OrderConfirmationEmailLine,
} from '@/modules/notifications/application/order-email-templates';

export interface SendOrderConfirmationEmailInput {
  customerEmail: string;
  orderId: string;
  lines: OrderConfirmationEmailLine[];
  totalDisplay: string;
  orderUrl: string;
}

/** Fired right after checkout — callers already have everything needed in
 * hand, so unlike `SendWelcomeEmail` this has no repository dependency or
 * idempotency check of its own. Failures here must never block checkout. */
export class SendOrderConfirmationEmail implements UseCase<SendOrderConfirmationEmailInput, void> {
  constructor(private readonly emailSender: EmailSender) {}

  async execute(input: SendOrderConfirmationEmailInput): Promise<void> {
    const { html, text } = await renderOrderConfirmationEmail({
      orderId: input.orderId,
      lines: input.lines,
      totalDisplay: input.totalDisplay,
      orderUrl: input.orderUrl,
    });
    await this.emailSender.send({
      to: input.customerEmail,
      subject: 'Your order is confirmed',
      html,
      text,
    });
  }
}
