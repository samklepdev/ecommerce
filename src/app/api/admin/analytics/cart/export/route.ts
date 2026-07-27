import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { parseDateRange, type DateRangeSearchParams } from '@/app/(admin)/admin/analytics/date-range';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EXPORT_LIMIT = 50_000;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function linesSummary(metadata: Record<string, unknown> | null): string {
  const lines = metadata?.lines;
  if (!Array.isArray(lines)) return '';
  return lines
    .map((line) => {
      if (typeof line !== 'object' || line === null) return '';
      const { variantId, quantity } = line as Record<string, unknown>;
      return `${String(variantId)}×${String(quantity)}`;
    })
    .join(' ');
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

  const { listAnalyticsEvents } = getContainer();
  const { items } = await listAnalyticsEvents.execute({
    eventType: 'cart_changed',
    since,
    until,
    limit: EXPORT_LIMIT,
    offset: 0,
  });

  const header = ['id', 'createdAt', 'lines', 'sessionId', 'userId', 'userAgent', 'ipAddress'];
  const rows = items.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      linesSummary(row.metadata),
      row.sessionId ?? '',
      row.userId ?? '',
      row.userAgent ?? '',
      row.ipAddress ?? '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cart-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
