import { Heading, Link, Text } from '@react-email/components';

import { EmailLayout, emailStyles } from '@/modules/notifications/application/emails/email-layout';
import { renderEmail, type RenderedEmail } from '@/modules/notifications/application/emails/render-email';

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

/** The short form shown to customers. The full id is in the URL — a customer
 * quoting an order in an email uses this. */
function shortId(orderId: string): string {
  return orderId.slice(0, 8);
}

export function OrderConfirmationEmail({
  orderId,
  lines,
  totalDisplay,
  orderUrl,
}: OrderConfirmationEmailInput) {
  return (
    <EmailLayout preview={`Order ${shortId(orderId)} confirmed`}>
      <Heading style={emailStyles.heading}>Order confirmed</Heading>
      <Text style={emailStyles.paragraph}>
        Thanks for your order — we&apos;ve received it and it&apos;s now on file.
      </Text>
      <Text style={emailStyles.detail}>Order {shortId(orderId)}</Text>
      <ul style={emailStyles.list}>
        {lines.map((line, i) => (
          // Index as key: these are a value snapshot, not entities, and the
          // list is rendered once and never reconciled.
          <li key={i}>
            {line.productName} × {line.quantity}
          </li>
        ))}
      </ul>
      <Text style={emailStyles.paragraph}>Total: {totalDisplay}</Text>
      <Text style={emailStyles.paragraph}>
        <Link href={orderUrl} style={emailStyles.link}>
          Track your order
        </Link>
      </Text>
    </EmailLayout>
  );
}

export function PaymentConfirmedEmail({
  orderId,
  totalDisplay,
  orderUrl,
  supportEmail,
}: PaymentConfirmedEmailInput) {
  return (
    <EmailLayout
      preview={`Bitcoin payment received for order ${shortId(orderId)}`}
      footerNote={
        <>
          Need help? Email{' '}
          <Link href={`mailto:${supportEmail}`} style={emailStyles.link}>
            {supportEmail}
          </Link>
          .
        </>
      }
    >
      <Heading style={emailStyles.heading}>Payment confirmed</Heading>
      <Text style={emailStyles.paragraph}>
        We&apos;ve confirmed your Bitcoin payment of {totalDisplay} for order{' '}
        {shortId(orderId)}.
      </Text>
      <Text style={emailStyles.paragraph}>
        We order from our supplier next. Expect a tracking number by email within 24–48
        hours — if it hasn&apos;t arrived by then, email{' '}
        <Link href={`mailto:${supportEmail}`} style={emailStyles.link}>
          {supportEmail}
        </Link>{' '}
        and we&apos;ll chase it.
      </Text>
      <Text style={emailStyles.paragraph}>
        <Link href={orderUrl} style={emailStyles.link}>
          View your order
        </Link>
      </Text>
    </EmailLayout>
  );
}

export interface UnderpaidEmailInput {
  orderId: string;
  orderUrl: string;
  /** All three as BTC strings, formatted by the caller — the template does no
   * money arithmetic, and sats-to-BTC conversion is display-only. */
  receivedBtc: string;
  expectedBtc: string;
  outstandingBtc: string;
  address: string;
  supportEmail: string;
}

/**
 * "You've paid some of it" — the email that makes a top-up possible for someone
 * who has closed the tab.
 *
 * Deliberately not an apology or a problem report. The order is still open, the
 * address hasn't changed, and the customer can finish paying; the useful content
 * is the outstanding number and where to send it. It also says the amount is
 * fixed, because the obvious worry on reading this is that the price has moved
 * while they were away.
 */
export function UnderpaidEmail({
  orderId,
  orderUrl,
  receivedBtc,
  expectedBtc,
  outstandingBtc,
  address,
  supportEmail,
}: UnderpaidEmailInput) {
  return (
    <EmailLayout
      preview={`${outstandingBtc} BTC still owed on order ${shortId(orderId)}`}
      footerNote={
        <>
          Questions? Email{' '}
          <Link href={`mailto:${supportEmail}`} style={emailStyles.link}>
            {supportEmail}
          </Link>
          .
        </>
      }
    >
      <Heading style={emailStyles.heading}>Your payment was short</Heading>
      <Text style={emailStyles.paragraph}>
        We received {receivedBtc} BTC for order {shortId(orderId)}, and the total is{' '}
        {expectedBtc} BTC.
      </Text>
      <Text style={emailStyles.paragraph}>
        Send the remaining <strong>{outstandingBtc} BTC</strong> to the same address to
        complete your order:
      </Text>
      {/* The address in the body, not only behind a link: a customer paying from
          a phone wallet needs something to copy, and an email client may not
          render the order page's QR. */}
      <Text style={{ ...emailStyles.detail, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        {address}
      </Text>
      <Text style={emailStyles.paragraph}>
        The amount owed is fixed at the rate you were originally quoted — it won&apos;t move
        while you finish paying.
      </Text>
      <Text style={emailStyles.paragraph}>
        <Link href={orderUrl} style={emailStyles.link}>
          View your order
        </Link>
      </Text>
    </EmailLayout>
  );
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
export function ShipmentEmail({ orderId, orderUrl, shipments, isComplete }: ShipmentEmailInput) {
  return (
    <EmailLayout preview={`Order ${shortId(orderId)} has shipped`}>
      <Heading style={emailStyles.heading}>Your order has shipped</Heading>
      <Text style={emailStyles.paragraph}>Order {shortId(orderId)} is on its way.</Text>
      <ul style={emailStyles.list}>
        {shipments.map((s, i) => (
          <li key={i} style={{ marginBottom: '8px' }}>
            {/* Tracking number and carrier label are admin-entered free text.
                JSX escapes them, which the string templates this replaced did
                not — a carrier label with an angle bracket used to break the
                markup. */}
            {s.items}: {s.carrierLabel ? `${s.carrierLabel} ` : ''}
            {s.trackingUrl ? (
              <Link href={s.trackingUrl} style={emailStyles.link}>
                {s.trackingNumber}
              </Link>
            ) : (
              s.trackingNumber
            )}
          </li>
        ))}
      </ul>
      {isComplete ? null : (
        <Text style={emailStyles.paragraph}>
          The rest of your order is still being prepared — you&apos;ll get another email when
          it ships.
        </Text>
      )}
      <Text style={emailStyles.paragraph}>
        <Link href={orderUrl} style={emailStyles.link}>
          View your order
        </Link>
      </Text>
    </EmailLayout>
  );
}

/** Pure rendering — no infra imports, unit-testable without a database or
 * network, per this repo's use-case testing rule. */
export function renderOrderConfirmationEmail(
  input: OrderConfirmationEmailInput,
): Promise<RenderedEmail> {
  return renderEmail(<OrderConfirmationEmail {...input} />);
}

export function renderPaymentConfirmedEmail(
  input: PaymentConfirmedEmailInput,
): Promise<RenderedEmail> {
  return renderEmail(<PaymentConfirmedEmail {...input} />);
}

export function renderShipmentEmail(input: ShipmentEmailInput): Promise<RenderedEmail> {
  return renderEmail(<ShipmentEmail {...input} />);
}

export function renderUnderpaidEmail(input: UnderpaidEmailInput): Promise<RenderedEmail> {
  return renderEmail(<UnderpaidEmail {...input} />);
}
