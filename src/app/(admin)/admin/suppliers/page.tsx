import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { SupplierActionsBar } from './SupplierActionsBar';
import { AdminSuppliersTable, type AdminSupplierRow } from './AdminSuppliersTable';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminSuppliersPage() {
  await requireAdmin();

  const { listSuppliersWithUsage } = getContainer();
  const suppliers = await listSuppliersWithUsage.execute();

  const rows: AdminSupplierRow[] = suppliers.map(({ supplier, usage }) => ({
    id: supplier.id,
    name: supplier.name,
    url: supplier.url,
    notes: supplier.notes,
    isActive: supplier.isActive,
    offerCount: usage.offerCount,
    supplierOrderCount: usage.supplierOrderCount,
  }));

  const activeCount = rows.filter((s) => s.isActive).length;
  const sourcedCount = rows.reduce((sum, s) => sum + s.offerCount, 0);

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <h1>Suppliers</h1>
        </div>
        {/* The products page shows how much of the catalog is live; the
            equivalent fact here is how many of these can still be sourced
            from, and how much of the catalog they carry. */}
        <span className={styles.headMeta}>
          {rows.length} total · {activeCount} active · {sourcedCount} offers
        </span>
      </header>

      <div className={styles.toolbar}>
        <SupplierActionsBar />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>All suppliers</h2>
          <span className={styles.sectionCount}>
            {rows.length} supplier{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <AdminSuppliersTable suppliers={rows} emptyMessage="No suppliers yet." />
      </section>
    </div>
  );
}
