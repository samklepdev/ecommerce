import { describe, expect, it } from 'vitest';

import {
  renderOrderConfirmationEmail,
  renderPaymentConfirmedEmail,
  renderShipmentEmail,
  renderUnderpaidEmail,
} from './order-email-templates';

/**
 * These render for real — no database, no network — which is the whole reason
 * the templates are kept pure.
 */
const SUPPORT = 'help@shop.example';
const ORDER_URL = 'https://shop.example/orders/abc12345';

async function allEmails() {
  return Promise.all([
    renderOrderConfirmationEmail({
      orderId: 'abc12345-6789',
      lines: [{ productName: 'Widget', quantity: 2 }],
      totalDisplay: '$42.00',
      orderUrl: ORDER_URL,
    }),
    renderPaymentConfirmedEmail({
      orderId: 'abc12345-6789',
      totalDisplay: '$42.00',
      orderUrl: ORDER_URL,
      supportEmail: SUPPORT,
    }),
    renderUnderpaidEmail({
      orderId: 'abc12345-6789',
      orderUrl: ORDER_URL,
      receivedBtc: '0.00040000',
      expectedBtc: '0.00100000',
      outstandingBtc: '0.00060000',
      address: 'bc1qtest',
      supportEmail: SUPPORT,
      topUpDeadline: '2026-08-03 10:30 UTC',
    }),
    renderShipmentEmail({
      orderId: 'abc12345-6789',
      orderUrl: ORDER_URL,
      shipments: [
        {
          trackingNumber: 'TRACK1',
          carrierLabel: 'Royal Mail',
          trackingUrl: 'https://track.example/TRACK1',
          items: 'Widget × 2',
        },
      ],
      isComplete: true,
    }),
  ]);
}

describe('customer emails', () => {
  /**
   * No customer-facing string may mention suppliers or sourcing. How stock is
   * obtained is not the customer's business, and naming it makes a promise
   * about the supply chain the shop has no reason to make.
   *
   * `PaymentConfirmedEmail` said "We order from our supplier next" — the only
   * such string that reached a customer surface. A test rather than a comment,
   * because the next person writing fulfilment copy will not have read the
   * comment.
   */
  it('never mention suppliers or sourcing', async () => {
    for (const email of await allEmails()) {
      for (const part of [email.html, email.text]) {
        expect(part.toLowerCase()).not.toMatch(/supplier|sourcing|dropship/);
      }
    }
  });

  it('all ship an HTML and a plain-text part', async () => {
    // A message with no text part scores worse with spam filters, and these
    // are the emails a customer must receive.
    for (const email of await allEmails()) {
      expect(email.html.length).toBeGreaterThan(0);
      expect(email.text.length).toBeGreaterThan(0);
    }
  });

  it('point at a real support address rather than a reply that goes nowhere', async () => {
    // Outbound mail sets no reply-to, so "reply to this email" pointed at
    // nothing — on the one path where the customer is about to lose money.
    const [, , underpaid] = await allEmails();
    expect(underpaid.text).not.toMatch(/reply to this email/i);
    expect(underpaid.text).toContain(SUPPORT);
  });

  it('state the top-up deadline, because missing it is irreversible', async () => {
    const [, , underpaid] = await allEmails();
    expect(underpaid.text).toContain('2026-08-03 10:30 UTC');
  });

  it('escape admin-entered values rather than interpolating them into markup', async () => {
    // Tracking numbers and carrier labels are free text. JSX escapes its
    // children; a template literal would not.
    const email = await renderShipmentEmail({
      orderId: 'abc12345-6789',
      orderUrl: ORDER_URL,
      shipments: [
        {
          trackingNumber: '<script>alert(1)</script>',
          carrierLabel: null,
          trackingUrl: null,
          items: 'Widget',
        },
      ],
      isComplete: true,
    });

    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});
