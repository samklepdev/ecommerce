import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { satsToBtcString } from '@/modules/payments/domain/bip21';
import { parseDateRange, type DateRangeSearchParams } from '@/app/(admin)/admin/analytics/date-range';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const searchParams: DateRangeSearchParams = {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  };
  const { since, until } = parseDateRange(searchParams);

  const { getOnChainActivityReport } = getContainer();
  const { orders } = await getOnChainActivityReport.execute({ since, until });

  // Both figures: an export that carried only one of them can't be reconciled,
  // which is the main reason anyone downloads this.
  const header = [
    'orderId',
    'address',
    'receivedBtc',
    'expectedBtc',
    'confirmations',
    'underpaid',
    'overpaid',
    'paidAt',
  ];
  const rows = orders.map((o) =>
    [
      o.orderId,
      o.address,
      satsToBtcString(o.confirmedSats || o.expectedSats),
      satsToBtcString(o.expectedSats),
      String(o.confirmations),
      String(o.underpaid),
      String(o.overpaid),
      o.paidAt.toISOString(),
    ]
      .map((v) => csvEscape(v))
      .join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="on-chain-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
