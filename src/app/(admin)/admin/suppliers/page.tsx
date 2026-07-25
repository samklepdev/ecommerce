import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { SupplierRow } from './SupplierRow';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminSuppliersPage() {
  await requireAdmin();

  const { listSuppliers } = getContainer();
  const suppliers = await listSuppliers.execute();

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Suppliers</h1>

        {suppliers.length === 0 ? (
          <p className={styles.empty}>No suppliers yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <SupplierRow
                    key={s.id}
                    id={s.id}
                    name={s.name}
                    url={s.url}
                    notes={s.notes}
                    isActive={s.isActive}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Stack>
    </PageContainer>
  );
}
