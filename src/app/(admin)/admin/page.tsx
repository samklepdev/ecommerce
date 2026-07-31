import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { Money } from '@/shared/domain/money';
import { parseDateRange } from './analytics/date-range';
import { alignToDays, eachDayKey } from './analytics/series';
import { AdminOverview, type AttentionQueue, type OrderRow } from './AdminOverview';

export const dynamic = 'force-dynamic';

const RECENT_ORDER_LIMIT = 8;

/** Thin by design: fetch, shape, hand to `AdminOverview`. */
export default async function AdminDashboardPage() {
  await requireAdmin();

  // The overview always shows the last 30 days; it has no range control of
  // its own, and /admin/analytics is where you go to change the window.
  const { since, until } = parseDateRange({});

  const {
    listUnfulfillableOrderLines,
    listSupplierOrdersNeedingAction,
    listAllOrdersForAdmin,
    getAdminOrderCounts,
    getRevenueSummary,
    getWebAnalyticsSummary,
    countOpenInquiries,
    countLatePayments,
  } = getContainer();

  const [
    unfulfillableLines,
    supplierOrdersNeedingAction,
    orderCounts,
    latestOrders,
    revenue,
    web,
    openInquiries,
    latePayments,
  ] =
    await Promise.all([
      listUnfulfillableOrderLines.execute(),
      listSupplierOrdersNeedingAction.execute(),
      // Counted in SQL, and only the rows this page actually renders are
      // fetched. Both used to come from reading every order in the store.
      getAdminOrderCounts.execute({ since, until }),
      listAllOrdersForAdmin.execute({ page: 1, pageSize: RECENT_ORDER_LIMIT }),
      getRevenueSummary.execute({ since, until }),
      getWebAnalyticsSummary.execute({ since, until }),
      countOpenInquiries.execute(),
      countLatePayments.execute(),
    ]);

  const { awaitingConfirmation, recovered } = orderCounts;

  // Ordered by how much a delay costs: money that may never settle first,
  // then orders that can't ship, then everything else.
  const queues: AttentionQueue[] = [
    // First, and above even unsettled payments: this is money already received
    // for an order that will never ship on its own. Expected to be 0.
    {
      label: 'Late payments on closed orders',
      count: latePayments,
      href: '/admin/orders',
      hint: 'Bitcoin arrived after the order expired or was cancelled',
    },
    {
      label: 'Orders awaiting confirmation',
      count: awaitingConfirmation,
      href: '/admin/orders',
      hint: 'Seen on-chain but not yet deep enough to fulfil',
    },
    {
      label: 'Open inquiries',
      count: openInquiries,
      href: '/admin/inquiries',
      hint: 'Customers waiting on an answer',
    },
    {
      label: 'Unsourced order lines',
      count: unfulfillableLines.length,
      href: '/admin/fulfillment',
      hint: 'Paid, with no supplier offer to buy from',
    },
    {
      label: 'Supplier orders needing action',
      count: supplierOrdersNeedingAction.length,
      href: '/admin/fulfillment',
      hint: 'Placed but not yet ordered or shipped',
    },
    {
      label: 'Recovered orders to review',
      count: recovered,
      href: '/admin/orders',
      hint: 'Payment landed after the order had expired',
    },
  ];

  const dayKeys = eachDayKey(since, until);
  const revenueByDay = alignToDays(dayKeys, revenue.days, (d) => d.day, (d) => d.totalMinor);
  const viewsByDay = alignToDays(dayKeys, web.pageViewsPerDay, (d) => d.day, (d) => d.count);

  // listAllForAdmin already returns newest first, so the page it hands back
  // is the recent-orders list.
  const recentOrders: OrderRow[] = latestOrders.items.map((o) => ({
      id: o.id,
      customerEmail: o.customerEmail,
      placed: o.createdAt.toISOString().slice(0, 10),
      amountLabel: Money.of(o.amountMinor, o.currency).toDisplayString(),
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
  }));

  return (
    <AdminOverview
      since={since}
      until={until}
      windowDays={Math.max(1, dayKeys.length)}
      queues={queues}
      revenueLabel={Money.of(
        revenue.days.reduce((t, d) => t + d.totalMinor, 0),
        revenue.currency,
      ).toDisplayString()}
      ordersCount={orderCounts.placedInWindow}
      itemsSold={revenue.days.reduce((t, d) => t + d.totalQuantity, 0)}
      pageViews={viewsByDay.reduce((t, v) => t + v, 0)}
      revenuePerDay={dayKeys.map((day, i) => ({ day, value: revenueByDay[i] ?? 0 }))}
      recentOrders={recentOrders}
    />
  );
}
