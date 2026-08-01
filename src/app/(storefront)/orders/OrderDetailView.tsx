import Link from 'next/link';

import { paymentStatusTone, fulfillmentStatusTone } from '@/app/lib/status-tone';
import { paymentStatusLabel, fulfillmentStatusLabel } from '@/app/lib/status-label';
import { Money } from '@/shared/domain/money';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { buildCarrierTrackingUrl, carrierLabel } from '@/shared/domain/carrier-tracking';
import { isOrderCancellable } from '@/modules/orders/domain/order-status';
import type { OrderDetail } from '@/modules/orders/application/ports/order-history-repository';
import type { SupplierOrderSummary } from '@/modules/orders/application/ports/supplier-order-repository';
import type { PaymentSession } from '@/modules/payments/application/use-cases/get-payment-session-for-order';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BitcoinCheckout } from '../checkout/BitcoinCheckout';
import { toWidgetStatus } from '../checkout/bitcoin-checkout-status';
import { CancelOrderButton, type CancelOrderButtonProps } from './CancelOrderButton';
import { ReorderButton, type ReorderButtonProps } from './ReorderButton';
import styles from './OrderDetailView.module.css';

interface OrderDetailViewProps {
  order: OrderDetail;
  shipments: SupplierOrderSummary[];
  paymentSession: PaymentSession | null;
  backHref: string;
  backLabel: string;
  /** Only passed by callers that offer cancellation (both storefront order
   * pages); omitted entirely on the admin order-detail page. */
  cancelAction?: CancelOrderButtonProps['action'];
  /** Same split as cancelAction — omitted on the admin order-detail page. */
  reorderAction?: ReorderButtonProps['action'];
  /**
   * Whether to wrap in the storefront's `PageContainer` (960px, centred).
   *
   * Admin passes `false` and supplies its own, wider container — otherwise
   * the order card sits visibly narrower than the notes editor and event
   * timeline rendered underneath it, which have no max width at all.
   */
  contained?: boolean;
}

export function OrderDetailView({
  order,
  shipments,
  paymentSession,
  backHref,
  backLabel,
  cancelAction,
  reorderAction,
  contained = true,
}: OrderDetailViewProps) {
  const subtotal = order.lines.reduce(
    (sum, line) => sum.add(Money.of(line.unitAmountMinor, order.currency).multiply(line.quantity)),
    Money.zero(order.currency),
  );
  const shipping = Money.of(order.shippingAmountMinor, order.currency);
  const discount = Money.of(order.discountAmountMinor, order.currency);
  // The persisted total, not a re-derivation of it — `amountMinor` is what
  // PlaceOrder charged and what the BTC quote was struck from. The lines
  // above it are the breakdown; this is the number that has to match the
  // confirmation email and the customer's wallet.
  const total = Money.of(order.amountMinor, order.currency);
  const trackedShipments = shipments.filter((s) => s.trackingNumber);

  const body = (
    <>
      <Stack gap={5}>
        <div>
          <Link href={backHref}>← {backLabel}</Link>
        </div>
        <h1>Order {order.id.slice(0, 8)}</h1>

        <Card className={styles.section}>
          <div className={styles.statusHeaderRow}>
            <div>
              <div className={styles.statusCell}>
                {/* Customer-facing wording, not the state machine's own — see
                    `status-label.ts`. */}
                <Badge size="md" tone={paymentStatusTone(order.paymentStatus)}>
                  {paymentStatusLabel(order.paymentStatus)}
                </Badge>
                <Badge size="md" tone={fulfillmentStatusTone(order.fulfillmentStatus)}>
                  {fulfillmentStatusLabel(order.fulfillmentStatus)}
                </Badge>
              </div>
              <p className={styles.empty}>Placed {order.createdAt.toLocaleString()}</p>
            </div>
            {cancelAction && isOrderCancellable(order.paymentStatus) && (
              <CancelOrderButton orderId={order.id} action={cancelAction} />
            )}
          </div>
        </Card>

        {paymentSession && (
          <BitcoinCheckout
            orderId={order.id}
            address={paymentSession.address}
            bip21Uri={paymentSession.bip21Uri}
            expiresAt={paymentSession.expiresAt.toISOString()}
            amountBtc={satsToBtcString(paymentSession.expectedSats)}
            amountFiat={total.toDisplayString()}
            initialStatus={toWidgetStatus(order.paymentStatus)}
          />
        )}

        <Card className={styles.section}>
          <div className={order.shippingAddress ? styles.bottomGrid : undefined}>
            <div className={styles.itemsColumn}>
              <div className={styles.sectionHeaderRow}>
                <h2 className={styles.sectionTitle}>Items</h2>
                {reorderAction && <ReorderButton orderId={order.id} action={reorderAction} />}
              </div>
              <ul className={styles.lineList}>
                {order.lines.map((line, i) => (
                  <li key={i} className={styles.lineRow}>
                    <span className={styles.lineInfo}>
                      {line.imageUrl && (
                        // Supplier image hosts are dynamic/admin-added, not known at build time.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={line.imageUrl} alt={line.productName} className={styles.lineThumb} />
                      )}
                      <span>
                        {line.productName} × {line.quantity}
                      </span>
                    </span>
                    <span>
                      {Money.of(line.unitAmountMinor, order.currency).multiply(line.quantity).toDisplayString()}
                    </span>
                  </li>
                ))}
              </ul>
              <div className={styles.lineRow}>
                <span>Subtotal</span>
                <span>{subtotal.toDisplayString()}</span>
              </div>
              {order.discountAmountMinor > 0 && (
                <div className={styles.lineRow}>
                  <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                  <span>-{discount.toDisplayString()}</span>
                </div>
              )}
              <div className={styles.lineRow}>
                <span>Shipping</span>
                <span>{shipping.toDisplayString()}</span>
              </div>
              <div className={styles.total}>
                <span>Total</span>
                <span>{total.toDisplayString()}</span>
              </div>
            </div>

            {order.shippingAddress && (
              <div className={styles.addressBlock}>
                <h2 className={styles.sectionTitle}>Shipping address</h2>
                <address className={styles.address}>
                  {order.shippingAddress.name}
                  <br />
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 ? <>, {order.shippingAddress.line2}</> : null}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.region}{' '}
                  {order.shippingAddress.postalCode}
                  <br />
                  {order.shippingAddress.country}
                </address>
              </div>
            )}
          </div>
        </Card>

        {trackedShipments.length > 0 && (
          <Card className={styles.section}>
            <h2 className={styles.sectionTitle}>Tracking</h2>
            {trackedShipments.map((s) => {
              const trackingUrl = buildCarrierTrackingUrl(s.carrier, s.trackingNumber!);
              const label = carrierLabel(s.carrier);
              return (
                <div key={s.id} className={styles.trackingRow}>
                  <span>{s.lines.map((l) => l.productName).join(', ')}</span>
                  <span>
                    {trackingUrl ? (
                      <a href={trackingUrl} target="_blank" rel="noreferrer">
                        {label} {s.trackingNumber}
                      </a>
                    ) : (
                      s.trackingNumber
                    )}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </Stack>
    </>
  );

  return contained ? <PageContainer>{body}</PageContainer> : body;
}
