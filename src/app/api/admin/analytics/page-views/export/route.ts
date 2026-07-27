import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { parseDateRange, type DateRangeSearchParams } from '@/app/(admin)/admin/analytics/date-range';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Analytics events are far higher-volume than the curated audit log
// (EXPORT_LIMIT there is 100_000) — every export here is already scoped
// to a date range via from/to, so this is a safety cap against an
// accidentally huge range, not the primary bound.
const EXPORT_LIMIT = 50_000;

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

  const { listAnalyticsEvents } = getContainer();
  const { items } = await listAnalyticsEvents.execute({
    eventType: 'page_view',
    since,
    until,
    limit: EXPORT_LIMIT,
    offset: 0,
  });

  const header = ['id', 'createdAt', 'path', 'referrer', 'sessionId', 'userId', 'userAgent', 'ipAddress'];
  const rows = items.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      row.path ?? '',
      row.referrer ?? '',
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
      'Content-Disposition': `attachment; filename="page-views-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
