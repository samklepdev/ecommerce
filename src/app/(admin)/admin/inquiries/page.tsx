import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { isInquiryStatus, type InquiryStatus } from '@/modules/inquiries/domain/inquiry';
import { AdminInquiriesTable, type AdminInquiryRow } from './AdminInquiriesTable';
import { InquiryStatusFilter } from './InquiryStatusFilter';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminInquiriesPageProps {
  searchParams: Promise<{ status?: string }>;
}

function parseStatus(raw: string | undefined): InquiryStatus | 'all' {
  if (raw === 'all') return 'all';
  return raw && isInquiryStatus(raw) ? raw : 'new';
}

export default async function AdminInquiriesPage({ searchParams }: AdminInquiriesPageProps) {
  await requireAdmin();
  const { status: statusParam } = await searchParams;
  const status = parseStatus(statusParam);

  const { listInquiries, countOpenInquiries } = getContainer();
  const [inquiries, openCount] = await Promise.all([
    listInquiries.execute({ status }),
    countOpenInquiries.execute(),
  ]);

  const rows: AdminInquiryRow[] = inquiries.map((inquiry) => ({
    id: inquiry.id,
    subject: inquiry.subject,
    message: inquiry.message,
    customerEmail: inquiry.customerEmail,
    isFromAccount: inquiry.userId !== null,
    status: inquiry.status,
    adminNotes: inquiry.adminNotes,
    receivedAt: inquiry.createdAt.toLocaleString(),
  }));

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <h1>Inquiries</h1>
        </div>
        <span className={styles.headMeta}>
          {openCount} open · {rows.length} shown
        </span>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          <InquiryStatusFilter selected={status} />
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{status === 'all' ? 'All inquiries' : `${status.replace('_', ' ')} inquiries`}</h2>
          <span className={styles.sectionCount}>
            {rows.length} message{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <AdminInquiriesTable
          inquiries={rows}
          emptyMessage={
            status === 'new' ? 'Nothing waiting. Everything has been picked up.' : 'Nothing here.'
          }
        />
      </section>
    </div>
  );
}
