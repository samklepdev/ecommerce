import Link from 'next/link';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { supplierOrderStatusTone } from '@/app/lib/status-tone';
import {
  markSupplierOrderOrderedAction,
  markSupplierOrderShippedAction,
  cancelSupplierOrderAction,
} from '@/app/actions/admin/fulfillment';
import { SupplierOrderReferenceEditor } from './SupplierOrderReferenceEditor';
import { SupplierOrderTrackingEditor } from './SupplierOrderTrackingEditor';
import { KNOWN_CARRIERS, carrierLabel } from '@/shared/domain/carrier-tracking';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { paginate, parsePage, DEFAULT_PAGE_SIZE } from '@/components/ui/paginate';
import type { SupplierOrderStatus } from '@/modules/orders/domain/supplier-order-status';
import type { SupplierOrderSummary } from '@/modules/orders/application/ports/supplier-order-repository';
import { StatusFilterSelect } from './StatusFilterSelect';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminFulfillmentPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

const VALID_STATUSES = new Set<SupplierOrderStatus>([
  'needs_ordering',
  'ordered',
  'shipped',
  'cancelled',
]);

function parseStatus(raw: string | undefined): SupplierOrderStatus | undefined {
  return raw && VALID_STATUSES.has(raw as SupplierOrderStatus)
    ? (raw as SupplierOrderStatus)
    : undefined;
}

function buildHref(status: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/admin/fulfillment?${qs}` : '/admin/fulfillment';
}

export default async function AdminFulfillmentPage({ searchParams }: AdminFulfillmentPageProps) {
  await requireAdmin();
  const { status: statusParam, page: pageParam } = await searchParams;

  const {
    listSupplierOrdersNeedingAction,
    listSupplierOrdersByStatus,
    listSuppliers,
    getOrderSummary,
    getShipmentsForOrder,
    listUnfulfillableOrderLines,
  } = getContainer();

  const unfulfillableLines = await listUnfulfillableOrderLines.execute();

  const supplierOrderList =
    statusParam === undefined
      ? await listSupplierOrdersNeedingAction.execute()
      : await listSupplierOrdersByStatus.execute({ status: parseStatus(statusParam) });

  const suppliers = await listSuppliers.execute();
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name] as const));

  const distinctOrderIds = [...new Set(supplierOrderList.map((so) => so.orderId))];

  const orderSummaries = new Map(
    await Promise.all(
      distinctOrderIds.map(
        async (orderId) => [orderId, await getOrderSummary.execute({ orderId })] as const,
      ),
    ),
  );

  // Checked across ALL of an order's supplier orders, not just the ones
  // that happen to be in the current status-filtered list — the default
  // "needs action" view excludes shipped rows entirely, so a sibling's
  // shipped status would otherwise be invisible right where Cancel is used
  // most.
  const hasShippedSiblingByOrderId = new Map(
    await Promise.all(
      distinctOrderIds.map(async (orderId) => {
        const allForOrder = await getShipmentsForOrder.execute({ orderId });
        return [orderId, allForOrder.some((so) => so.status === 'shipped')] as const;
      }),
    ),
  );

  const groupsByOrderId = new Map<string, SupplierOrderSummary[]>();
  for (const so of supplierOrderList) {
    const list = groupsByOrderId.get(so.orderId) ?? [];
    list.push(so);
    groupsByOrderId.set(so.orderId, list);
  }
  const allGroups = [...groupsByOrderId.entries()];

  const { items: pagedGroups, page, totalPages } = paginate(
    allGroups,
    parsePage(pageParam),
    DEFAULT_PAGE_SIZE,
  );

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.toolbar}>
          <h1>Fulfillment</h1>
          <StatusFilterSelect selectedStatus={statusParam} />
        </div>

        {unfulfillableLines.length > 0 && (
          <Card className={styles.attentionSection}>
            <h2 className={styles.attentionTitle}>
              Needs a supplier offer ({unfulfillableLines.length})
            </h2>
            <ul className={styles.lineList}>
              {unfulfillableLines.map((line) => (
                <li key={line.orderLineId} className={styles.lineItem}>
                  <span>
                    Order {line.orderId.slice(0, 8)} — {line.sku}
                  </span>
                  <Link href="/admin/products">Add supplier offer →</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {allGroups.length === 0 && <p className={styles.empty}>Nothing here.</p>}

        <Stack gap={5}>
          {pagedGroups.map(([orderId, group]) => {
            const order = orderSummaries.get(orderId);
            const address = order?.shippingAddress;
            const hasShippedSibling = hasShippedSiblingByOrderId.get(orderId) ?? false;

            return (
              <div key={orderId}>
                <h2 className={styles.orderHeading}>
                  Order {orderId.slice(0, 8)} — {order?.customerEmail}
                </h2>
                <Stack gap={3}>
                  {group.map((so) => (
                    <Card key={so.id}>
                      <div className={styles.cardHeader}>
                        <h3 className={styles.supplierName}>
                          {supplierNameById.get(so.supplierId) ?? so.supplierId}
                        </h3>
                        <Badge tone={supplierOrderStatusTone(so.status)}>{so.status}</Badge>
                      </div>

                      <div className={styles.grid}>
                        <div>
                          <h4 className={styles.sectionLabel}>Ship to</h4>
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
                          <h4 className={styles.sectionLabel}>Items to buy</h4>
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

                      {(so.status === 'ordered' || so.status === 'shipped') &&
                        so.supplierOrderReference && (
                          <SupplierOrderReferenceEditor
                            supplierOrderId={so.id}
                            reference={so.supplierOrderReference}
                          />
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
                          <Field
                            label="Carrier"
                            htmlFor={`carrier-${so.id}`}
                            className={styles.actionField}
                          >
                            <Select id={`carrier-${so.id}`} name="carrier" defaultValue="">
                              <option value="">Unspecified</option>
                              {KNOWN_CARRIERS.map((c) => (
                                <option key={c} value={c}>
                                  {carrierLabel(c)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Button type="submit">Mark shipped</Button>
                        </form>
                      )}

                      {so.status === 'shipped' && so.trackingNumber && (
                        <SupplierOrderTrackingEditor
                          supplierOrderId={so.id}
                          trackingNumber={so.trackingNumber}
                          carrier={so.carrier}
                        />
                      )}

                      {(so.status === 'needs_ordering' || so.status === 'ordered') && (
                        <div className={styles.cancelRow}>
                          {hasShippedSibling && (
                            <p className={styles.warning}>
                              Note: another supplier for this order has already shipped.
                            </p>
                          )}
                          <form action={cancelSupplierOrderAction}>
                            <input type="hidden" name="supplierOrderId" value={so.id} />
                            <input type="hidden" name="orderId" value={so.orderId} />
                            <Button type="submit" variant="danger">
                              Cancel
                            </Button>
                          </form>
                        </div>
                      )}
                    </Card>
                  ))}
                </Stack>
              </div>
            );
          })}
        </Stack>

        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => buildHref(statusParam, p)}
        />
      </Stack>
    </PageContainer>
  );
}
