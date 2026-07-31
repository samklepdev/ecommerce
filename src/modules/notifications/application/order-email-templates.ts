export interface OrderConfirmationEmailLine {
  productName: string;
  quantity: number;
}

export interface OrderConfirmationEmailInput {
  orderId: string;
  lines: OrderConfirmationEmailLine[];
  totalDisplay: string;
  orderUrl: string;
}

export interface PaymentConfirmedEmailInput {
  orderId: string;
  totalDisplay: string;
  orderUrl: string;
  /** Where to chase a missing tracking number. Outbound mail has no
   * reply-to, so "reply to this email" would point at nothing. */
  supportEmail: string;
}

/** Pure rendering — no infra imports, unit-testable without a database or
 * network, per this repo's use-case testing rule. */
export function renderOrderConfirmationEmailHtml({
  orderId,
  lines,
  totalDisplay,
  orderUrl,
}: OrderConfirmationEmailInput): string {
  const lineItems = lines
    .map((line) => `<li>${line.productName} × ${line.quantity}</li>`)
    .join('\n');

  return `
    <html>
      <body style="font-family: sans-serif; color: #111;">
        <h1>Order confirmed</h1>
        <p>Thanks for your order — we've received it and it's now on file.</p>
        <p>Order ${orderId.slice(0, 8)}</p>
        <ul>${lineItems}</ul>
        <p>Total: ${totalDisplay}</p>
        <p><a href="${orderUrl}">Track your order</a></p>
      </body>
    </html>
  `.trim();
}

export function renderPaymentConfirmedEmailHtml({
  orderId,
  totalDisplay,
  orderUrl,
  supportEmail,
}: PaymentConfirmedEmailInput): string {
  return `
    <html>
      <body style="font-family: sans-serif; color: #111;">
        <h1>Payment confirmed</h1>
        <p>We've confirmed your Bitcoin payment of ${totalDisplay} for order ${orderId.slice(0, 8)}.</p>
        <p>
          We order from our supplier next. Expect a tracking number by email within
          24&ndash;48 hours &mdash; if it hasn't arrived by then, email
          <a href="mailto:${supportEmail}">${supportEmail}</a> and we'll chase it.
        </p>
        <p><a href="${orderUrl}">View your order</a></p>
      </body>
    </html>
  `.trim();
}


export interface ShipmentEmailInput {
  orderId: string;
  orderUrl: string;
  /** One entry per parcel: an order split across suppliers ships in parts,
   * and the customer should see all of them, not just the newest. */
  shipments: {
    trackingNumber: string;
    carrierLabel: string | null;
    trackingUrl: string | null;
    items: string;
  }[];
  /** False while other parcels on the same order are still to come. */
  isComplete: boolean;
}

/**
 * "It's on its way", with the tracking number the payment-confirmed email
 * promised within 24-48 hours.
 *
 * Sent per parcel rather than per order: an order split across suppliers
 * ships in parts, and holding the first tracking number back until the last
 * one exists is how a customer ends up emailing to ask where their order is.
 */
export function renderShipmentEmailHtml({
  orderId,
  orderUrl,
  shipments,
  isComplete,
}: ShipmentEmailInput): string {
  const rows = shipments
    .map(
      (s) => `
        <li style="margin-bottom: 8px;">
          ${s.items}: ${s.carrierLabel ? `${s.carrierLabel} ` : ''}${
            s.trackingUrl
              ? `<a href="${s.trackingUrl}">${s.trackingNumber}</a>`
              : s.trackingNumber
          }
        </li>`,
    )
    .join('');

  return `
    <html>
      <body style="font-family: sans-serif; color: #111;">
        <h1>Your order has shipped</h1>
        <p>Order ${orderId.slice(0, 8)} is on its way.</p>
        <ul>${rows}</ul>
        ${
          isComplete
            ? ''
            : '<p>The rest of your order is still being prepared &mdash; you\'ll get another email when it ships.</p>'
        }
        <p><a href="${orderUrl}">View your order</a></p>
      </body>
    </html>
  `.trim();
}
