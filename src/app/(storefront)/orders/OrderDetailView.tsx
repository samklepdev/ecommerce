import Link from 'next/link';

import { paymentStatusTone, fulfillmentStatusTone } from '@/app/lib/status-tone';
import { Money } from '@/shared/domain/money';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import type { OrderDetail } from '@/modules/orders/application/ports/order-history-repository';
import type { SupplierOrderSummary } from '@/modules/orders/application/ports/supplier-order-repository';
import type { PaymentSession } from '@/modules/payments/application/use-cases/get-payment-session-for-order';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BitcoinCheckout } from '../checkout/BitcoinCheckout';
import { CancelOrderButton, type CancelOrderButtonProps } from './CancelOrderButton';
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
}

const CANCELLABLE_STATUSES = new Set(['pending', 'awaiting_payment']);

export function OrderDetailView({
  order,
  shipments,
  paymentSession,
  backHref,
  backLabel,
  cancelAction,
}: OrderDetailViewProps) {
  const subtotal = order.lines.reduce(
    (sum, line) => sum.add(Money.of(line.unitAmountMinor, order.currency).multiply(line.quantity)),
    Money.zero(order.currency),
  );
  const shipping = Money.of(order.shippingAmountMinor, order.currency);
  const total = subtotal.add(shipping);
  const trackedShipments = shipments.filter((s) => s.trackingNumber);

  return (
    <PageContainer>
      <Stack gap={5}>
        <div>
          <Link href={backHref}>← {backLabel}</Link>
        </div>
        <h1>Order {order.id.slice(0, 8)}</h1>

        <Card className={styles.section}>
          <div className={styles.statusCell}>
            <Badge tone={paymentStatusTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
            <Badge tone={fulfillmentStatusTone(order.fulfillmentStatus)}>
              {order.fulfillmentStatus}
            </Badge>
          </div>
          <p className={styles.empty}>Placed {order.createdAt.toLocaleString()}</p>
          {cancelAction && CANCELLABLE_STATUSES.has(order.paymentStatus) && (
            <CancelOrderButton orderId={order.id} action={cancelAction} />
          )}
        </Card>

        {paymentSession && (
          <BitcoinCheckout
            orderId={order.id}
            address={paymentSession.address}
            bip21Uri={paymentSession.bip21Uri}
            expiresAt={paymentSession.expiresAt.toISOString()}
            amountBtc={satsToBtcString(paymentSession.expectedSats)}
            amountFiat={total.toDisplayString()}
          />
        )}

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Items</h2>
          <ul className={styles.lineList}>
            {order.lines.map((line, i) => (
              <li key={i} className={styles.lineRow}>
                <span>
                  {line.sku} × {line.quantity}
                </span>
                <span>
                  {Money.of(line.unitAmountMinor, order.currency).multiply(line.quantity).toDisplayString()}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.lineRow}>
            <span>Shipping</span>
            <span>{shipping.toDisplayString()}</span>
          </div>
          <div className={styles.total}>
            <span>Total</span>
            <span>{total.toDisplayString()}</span>
          </div>
        </Card>

        {order.shippingAddress && (
          <Card className={styles.section}>
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
          </Card>
        )}

        {trackedShipments.length > 0 && (
          <Card className={styles.section}>
            <h2 className={styles.sectionTitle}>Tracking</h2>
            {trackedShipments.map((s) => (
              <div key={s.id} className={styles.trackingRow}>
                <span>{s.lines.map((l) => l.sku).join(', ')}</span>
                <span>{s.trackingNumber}</span>
              </div>
            ))}
          </Card>
        )}
      </Stack>
    </PageContainer>
  );
}
