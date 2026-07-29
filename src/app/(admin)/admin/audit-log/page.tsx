import { getContainer } from '@/composition/container';
import { summariseUserAgent } from '@/shared/domain/user-agent';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Pagination } from '@/components/ui/Pagination';
import { DEFAULT_PAGE_SIZE, parsePage } from '@/components/ui/paginate';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminAuditLogPageProps {
  searchParams: Promise<{ page?: string }>;
}

function buildHref(nextPage: number): string {
  return nextPage > 1 ? `/admin/audit-log?page=${nextPage}` : '/admin/audit-log';
}

export default async function AdminAuditLogPage({ searchParams }: AdminAuditLogPageProps) {
  await requireAdmin();
  const { page: pageParam } = await searchParams;

  const { listAuditLogEntries } = getContainer();

  const requestedPage = parsePage(pageParam);
  let { items: entries, total } = await listAuditLogEntries.execute({
    limit: DEFAULT_PAGE_SIZE,
    offset: (requestedPage - 1) * DEFAULT_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  let page = requestedPage;

  if (requestedPage > totalPages) {
    page = totalPages;
    ({ items: entries, total } = await listAuditLogEntries.execute({
      limit: DEFAULT_PAGE_SIZE,
      offset: (page - 1) * DEFAULT_PAGE_SIZE,
    }));
  }

  return (
    <PageContainer>
      <Stack gap={5}>
        <div className={styles.headerRow}>
          <h1>Audit log</h1>
          <a href="/api/admin/audit-log/export" className={styles.exportLink}>
            Export CSV
          </a>
        </div>
        <p className={styles.meta}>
          A record of sensitive admin actions — refunds, promotions, price/markup changes,
          cancellations, and deletions.
        </p>

        {entries.length === 0 ? (
          <p className={styles.empty}>No audit log entries yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.createdAt.toLocaleString()}</td>
                    <td>{entry.actorEmail}</td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.targetType}: {entry.targetId}
                    </td>
                    <td className={styles.origin}>
                      {/* Raw agent stored, readable form shown — an admin
                          scanning this wants "Chrome on macOS", not 140
                          characters of Mozilla/5.0. */}
                      {entry.ipAddress ?? '—'}
                      {summariseUserAgent(entry.userAgent) && (
                        <span className={styles.originAgent} title={entry.userAgent ?? undefined}>
                          {summariseUserAgent(entry.userAgent)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
      </Stack>
    </PageContainer>
  );
}
