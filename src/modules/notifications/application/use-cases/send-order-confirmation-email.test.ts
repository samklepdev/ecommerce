import { describe, expect, it } from 'vitest';

import { SendOrderConfirmationEmail } from './send-order-confirmation-email';
import type { EmailSender } from '@/modules/notifications/application/ports/email-sender';

function makeFakeEmailSender() {
  const sent: { to: string; subject: string; html: string }[] = [];
  const sender: EmailSender = {
    async send(to, subject, html) {
      sent.push({ to, subject, html });
    },
  };
  return { sender, sent };
}

describe('SendOrderConfirmationEmail', () => {
  it('sends a confirmation email with the order lines and total to the customer', async () => {
    const { sender, sent } = makeFakeEmailSender();

    await new SendOrderConfirmationEmail(sender).execute({
      customerEmail: 'buyer@example.com',
      orderId: 'order-1234',
      lines: [{ productName: 'Blue Widget', quantity: 2 }],
      totalDisplay: '$42.00',
      orderUrl: 'https://shop.example.com/orders/order-1234',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('buyer@example.com');
    expect(sent[0]?.subject).toMatch(/order/i);
    expect(sent[0]?.html).toContain('Blue Widget');
    expect(sent[0]?.html).toContain('$42.00');
    expect(sent[0]?.html).toContain('https://shop.example.com/orders/order-1234');
  });
});
