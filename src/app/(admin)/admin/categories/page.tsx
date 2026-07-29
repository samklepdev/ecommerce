import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { CategoryActionsBar } from './CategoryActionsBar';
import { AdminCategoriesTable, type AdminCategoryRow } from './AdminCategoriesTable';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminCategoriesPage() {
  await requireAdmin();

  const { listCategories } = getContainer();
  const categories = await listCategories.execute();

  const rows: AdminCategoryRow[] = categories.map(({ category, productCount }) => ({
    id: category.id,
    name: category.name,
    slug: category.slug.value,
    description: category.description,
    productCount,
  }));

  const categorized = rows.reduce((sum, c) => sum + c.productCount, 0);

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <h1>Categories</h1>
        </div>
        <span className={styles.headMeta}>
          {rows.length} total · {categorized} product{categorized === 1 ? '' : 's'} categorized
        </span>
      </header>

      <div className={styles.toolbar}>
        <CategoryActionsBar />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>All categories</h2>
          <span className={styles.sectionCount}>
            {rows.length} categor{rows.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        <AdminCategoriesTable
          categories={rows}
          emptyMessage="No categories yet. Products without one show as uncategorized."
        />
      </section>
    </div>
  );
}
