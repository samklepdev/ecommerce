import { NextResponse } from 'next/server';

import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EXPORT_LIMIT = 100_000; // curated log of sensitive admin actions — low volume by design.

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { listAuditLogEntries } = getContainer();
  const { items } = await listAuditLogEntries.execute({ limit: EXPORT_LIMIT, offset: 0 });

  const header = ['id', 'createdAt', 'actorEmail', 'actorUserId', 'action', 'targetType', 'targetId', 'metadata'];
  const rows = items.map((entry) =>
    [
      entry.id,
      entry.createdAt.toISOString(),
      entry.actorEmail,
      entry.actorUserId ?? '',
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.metadata ? JSON.stringify(entry.metadata) : '',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  );
  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
