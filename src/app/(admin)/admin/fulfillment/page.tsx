import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import {
  markSupplierOrderOrderedAction,
  markSupplierOrderShippedAction,
} from '@/app/actions/admin/fulfillment';

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
    <main>
      <h1>Fulfillment</h1>
      {supplierOrders.length === 0 && <p>Nothing needs action.</p>}
      <ul>
        {supplierOrders.map((so) => {
          const order = orderSummaries.get(so.orderId);
          const address = order?.shippingAddress;
          return (
            <li key={so.id}>
              <h2>
                {supplierNameById.get(so.supplierId) ?? so.supplierId} — {so.status}
              </h2>
              <p>Ship to: {order?.customerEmail}</p>
              {address && (
                <address>
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
              <ul>
                {so.lines.map((line, i) => (
                  <li key={i}>
                    {line.sku} × {line.quantity} — cost {line.unitCostMinor / 100} {so.costCurrency}
                  </li>
                ))}
              </ul>
              <p>
                Total cost: {so.costTotalMinor / 100} {so.costCurrency}
              </p>

              {so.status === 'needs_ordering' && (
                <form action={markSupplierOrderOrderedAction}>
                  <input type="hidden" name="supplierOrderId" value={so.id} />
                  <label>
                    Supplier order reference
                    <input type="text" name="reference" required />
                  </label>
                  <button type="submit">Mark ordered</button>
                </form>
              )}

              {so.status === 'ordered' && (
                <form action={markSupplierOrderShippedAction}>
                  <input type="hidden" name="supplierOrderId" value={so.id} />
                  <input type="hidden" name="orderId" value={so.orderId} />
                  <label>
                    Tracking number
                    <input type="text" name="trackingNumber" required />
                  </label>
                  <button type="submit">Mark shipped</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
