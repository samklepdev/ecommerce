import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { supplierOrderStatusTone } from '@/app/lib/status-tone';
import {
  markSupplierOrderOrderedAction,
  markSupplierOrderShippedAction,
} from '@/app/actions/admin/fulfillment';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminFulfillmentPage() {
  await requireAdmin();

  const { listSupplierOrdersNeedingAction, listSuppliers, getOrderSummary } = getContainer();

  const [supplierOrders, suppliers] = await Promise.all([
    listSupplierOrdersNeedingAction.execute(),
    listSuppliers.execute(),
  ]);
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name] as const));

  const orderSummaries = new Map(
    await Promise.all(
      [...new Set(supplierOrders.map((so) => so.orderId))].map(
        async (orderId) => [orderId, await getOrderSummary.execute({ orderId })] as const,
      ),
    ),
  );

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Fulfillment</h1>

        {supplierOrders.length === 0 && <p className={styles.empty}>Nothing needs action.</p>}

        <Stack gap={4}>
          {supplierOrders.map((so) => {
            const order = orderSummaries.get(so.orderId);
            const address = order?.shippingAddress;

            return (
              <Card key={so.id}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.supplierName}>
                    {supplierNameById.get(so.supplierId) ?? so.supplierId}
                  </h2>
                  <Badge tone={supplierOrderStatusTone(so.status)}>{so.status}</Badge>
                </div>

                <div className={styles.grid}>
                  <div>
                    <h3 className={styles.sectionLabel}>Ship to</h3>
                    <p>{order?.customerEmail}</p>
                    {address && (
                      <address className={styles.address}>
                        {address.name}
                        <br />
                        {address.line1}
                        {address.line2 ? <>, {address.line2}</> : null}
                        <br />
                        {address.city}, {address.region} {address.postalCode}
                        <br />
                        {address.country}
                      </address>
                    )}
                  </div>

                  <div>
                    <h3 className={styles.sectionLabel}>Items to buy</h3>
                    <ul className={styles.lineList}>
                      {so.lines.map((line, i) => (
                        <li key={i} className={styles.lineItem}>
                          <span>
                            {line.sku} × {line.quantity}
                          </span>
                          <span>{((line.unitCostMinor * line.quantity) / 100).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className={styles.total}>
                      Total cost: {(so.costTotalMinor / 100).toFixed(2)} {so.costCurrency}
                    </p>
                  </div>
                </div>

                {so.status === 'needs_ordering' && (
                  <form action={markSupplierOrderOrderedAction} className={styles.actionForm}>
                    <input type="hidden" name="supplierOrderId" value={so.id} />
                    <Field
                      label="Supplier order reference"
                      htmlFor={`reference-${so.id}`}
                      className={styles.actionField}
                    >
                      <Input type="text" id={`reference-${so.id}`} name="reference" required />
                    </Field>
                    <Button type="submit">Mark ordered</Button>
                  </form>
                )}

                {so.status === 'ordered' && (
                  <form action={markSupplierOrderShippedAction} className={styles.actionForm}>
                    <input type="hidden" name="supplierOrderId" value={so.id} />
                    <input type="hidden" name="orderId" value={so.orderId} />
                    <Field
                      label="Tracking number"
                      htmlFor={`tracking-${so.id}`}
                      className={styles.actionField}
                    >
                      <Input
                        type="text"
                        id={`tracking-${so.id}`}
                        name="trackingNumber"
                        required
                      />
                    </Field>
                    <Button type="submit">Mark shipped</Button>
                  </form>
                )}
              </Card>
            );
          })}
        </Stack>
      </Stack>
    </PageContainer>
  );
}
