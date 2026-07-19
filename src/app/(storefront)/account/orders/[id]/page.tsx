import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getContainer } from '@/composition/container';
import { getSessionUser } from '@/app/lib/session';
import { paymentStatusTone, fulfillmentStatusTone } from '@/app/lib/status-tone';
import { Money } from '@/shared/domain/money';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BitcoinCheckout } from '../../../checkout/BitcoinCheckout';
import styles from '../page.module.css';

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

const AWAITING_PAYMENT_STATUSES = new Set(['pending', 'awaiting_payment', 'awaiting_confirmation']);

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const { getOrderDetailForCustomer, getPaymentSessionForOrder, getShipmentsForOrder } =
    getContainer();

  const order = await getOrderDetailForCustomer.execute({ orderId: id, userId: user.id });
  if (!order) notFound();

  const total = order.lines.reduce(
    (sum, line) => sum.add(Money.of(line.unitAmountMinor, order.currency).multiply(line.quantity)),
    Money.zero(order.currency),
  );

  const shipments = await getShipmentsForOrder.execute({ orderId: order.id });
  const trackedShipments = shipments.filter((s) => s.trackingNumber);

  let paymentSession = null;
  if (AWAITING_PAYMENT_STATUSES.has(order.paymentStatus)) {
    paymentSession = await getPaymentSessionForOrder.execute({ orderId: order.id });
  }

  return (
    <PageContainer>
      <Stack gap={5}>
        <div>
          <Link href="/account/orders">← Back to orders</Link>
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
        </Card>

        {paymentSession && (
          <BitcoinCheckout
            orderId={order.id}
            address={paymentSession.address}
            bip21Uri={paymentSession.bip21Uri}
            expiresAt={paymentSession.expiresAt.toISOString()}
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
                  {Money.of(line.unitAmountMinor, order.currency).multiply(line.quantity).toString()}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.total}>
            <span>Total</span>
            <span>{total.toString()}</span>
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
