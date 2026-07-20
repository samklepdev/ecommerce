export interface OrderConfirmationEmailLine {
  sku: string;
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
    .map((line) => `<li>${line.sku} × ${line.quantity}</li>`)
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
}: PaymentConfirmedEmailInput): string {
  return `
    <html>
      <body style="font-family: sans-serif; color: #111;">
        <h1>Payment confirmed</h1>
        <p>We've confirmed your Bitcoin payment of ${totalDisplay} for order ${orderId.slice(0, 8)}.</p>
        <p><a href="${orderUrl}">View your order</a></p>
      </body>
    </html>
  `.trim();
}
