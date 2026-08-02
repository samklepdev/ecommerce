import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { toCsv } from '@/app/lib/csv';
import { Money } from '@/shared/domain/money';
import {
  parseFulfillmentStatus,
  parsePaymentStatus,
} from '@/modules/orders/domain/order-status';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * How many orders one download may contain.
 *
 * The list endpoint pages; an export cannot, so this is the only thing
 * standing between a click and the whole orders table in memory. Ten thousand
 * is far past any plausible reconciliation window and still bounded — and the
 * response says when it truncated, because an export that silently stops is
 * worse than one that refuses.
 */
const EXPORT_LIMIT = 10_000;

/**
 * The orders list, as CSV, honouring the same filters as the page.
 *
 * There was no orders export at all — audit-log and four analytics views had
 * one, the actual orders did not. So reconciling a month's takings against a
 * bank or an exchange, or handing a spreadsheet to an accountant, meant
 * copying rows off a paginated screen.
 *
 * Reads the same query parameters as `/admin/orders`, so "export what I am
 * looking at" is literally the same filter applied to the same query rather
 * than a second implementation that could disagree with the screen.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const filter = {
    email: url.searchParams.get('email') ?? undefined,
    paymentStatus: parsePaymentStatus(url.searchParams.get('paymentStatus') ?? undefined),
    fulfillmentStatus: parseFulfillmentStatus(
      url.searchParams.get('fulfillmentStatus') ?? undefined,
    ),
    recovered: url.searchParams.get('recovered') === '1',
    latePayment: url.searchParams.get('latePayment') === '1',
  };

  const { listAllOrdersForAdmin } = getContainer();
  const { items, totalItems } = await listAllOrdersForAdmin.execute({
    ...filter,
    page: 1,
    pageSize: EXPORT_LIMIT,
  });

  const header = [
    'orderId',
    'placedAt',
    'customerEmail',
    'total',
    'currency',
    'paymentStatus',
    'fulfillmentStatus',
    'recoveredFrom',
  ];
  const rows = items.map((o) => [
    o.id,
    o.createdAt.toISOString(),
    o.customerEmail,
    // The major-unit decimal, not the minor-unit integer: this lands in a
    // spreadsheet next to bank figures, and `2080` against `$20.80` is how a
    // reconciliation goes wrong by two orders of magnitude.
    Money.of(o.amountMinor, o.currency).toDecimalString(),
    o.currency,
    o.paymentStatus,
    o.fulfillmentStatus,
    o.paymentRecoveredFrom ?? '',
  ]);

  const csv = toCsv(header, rows);
  const truncated = totalItems > items.length;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      // Said out loud rather than left to be noticed: a silently short export
      // is a wrong total that looks like a right one.
      ...(truncated
        ? { 'X-Export-Truncated': `${items.length} of ${totalItems}` }
        : {}),
    },
  });
}
