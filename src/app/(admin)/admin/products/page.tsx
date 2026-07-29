import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { ProductActionsBar } from './ProductActionsBar';
import { SupplierFilterSelect } from './SupplierFilterSelect';
import { AdminProductsTable, type AdminProductRow } from './AdminProductsTable';
import { Pagination } from '@/components/ui/Pagination';
import { parsePage, DEFAULT_PAGE_SIZE } from '@/components/ui/paginate';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface AdminProductsPageProps {
  searchParams: Promise<{ supplierId?: string; page?: string }>;
}

function buildHref(supplierId: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (supplierId) params.set('supplierId', supplierId);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/admin/products?${qs}` : '/admin/products';
}

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  await requireAdmin();
  const { supplierId, page: pageParam } = await searchParams;

  const {
    listAllProductsForAdmin,
    listSuppliers,
    listSupplierOffersForProducts,
    getAdminCatalogCounts,
    listCategories,
  } = getContainer();

  // One page of products, filtered and counted in SQL; then a single query
  // for that page's offers. This page used to load the whole catalog, run an
  // offers query per product, filter by supplier in memory, and slice in
  // JavaScript.
  const [pageResult, suppliers, catalogCounts, categories] = await Promise.all([
    listAllProductsForAdmin.execute({
      supplierId,
      page: parsePage(pageParam),
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    listSuppliers.execute(),
    getAdminCatalogCounts.execute(),
    listCategories.execute(),
  ]);

  const { items: pagedProducts, page, totalPages, totalItems } = pageResult;
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name] as const));
  // The filter dropdown shows every supplier (including inactive) so admins
  // can still find products sourced from one they've since deactivated —
  // but "source from" pickers (new product, new supplier offer) only offer
  // active ones.
  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));
  const activeSupplierOptions = suppliers
    .filter((s) => s.isActive)
    .map((s) => ({ id: s.id, name: s.name }));

  const offersByProduct = await listSupplierOffersForProducts.execute({
    productIds: pagedProducts.map((p) => p.id),
  });

  const { total: catalogTotal, active: activeCount } = catalogCounts;
  const categoryOptions = categories.map((c) => ({ id: c.category.id, name: c.category.name }));

  const rows: AdminProductRow[] = pagedProducts.map((p) => {
    const offers = offersByProduct.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      slug: p.slug.value,
      status: p.status,
      category: p.category,
      categoryId: p.categoryId,
      imageUrl: p.imageUrl,
      additionalImages: p.additionalImages,
      sku: p.sku,
      priceAmountMinor: p.price.amountMinor,
      currency: p.price.currency,
      hasNoOffers: offers.length === 0,
      offers: offers.map((offer) => ({
        id: offer.id,
        supplierId: offer.supplierId,
        supplierName: supplierNameById.get(offer.supplierId) ?? offer.supplierId,
        isPreferred: offer.isPreferred,
        costAmountMinor: offer.cost.amountMinor,
        currency: offer.cost.currency,
      })),
    };
  });

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <h1>Products</h1>
        </div>
        {/* The dashboard puts the date range here; the equivalent fact for a
            catalog is how much of it is actually live. */}
        <span className={styles.headMeta}>
          {catalogTotal} total · {activeCount} live · {suppliers.length} suppliers
        </span>
      </header>

      <div className={styles.toolbar}>
        <ProductActionsBar suppliers={activeSupplierOptions} categories={categoryOptions} />
        <div className={styles.filterRow}>
          <SupplierFilterSelect suppliers={supplierOptions} selectedSupplierId={supplierId} />
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          {/* Not "Catalog" — that's already the sidebar's group name, and one
              word meaning two things is how a console stops being learnable. */}
          <h2>All products</h2>
          <span className={styles.sectionCount}>
            {totalItems === catalogTotal
              ? `${totalItems} products`
              : `${totalItems} of ${catalogTotal} products`}
          </span>
        </div>

        <AdminProductsTable
          products={rows}
          emptyMessage={supplierId ? 'No products from this supplier.' : 'No products yet.'}
          suppliers={activeSupplierOptions}
          categories={categoryOptions}
        />

        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => buildHref(supplierId, p)}
        />
      </section>
    </div>
  );
}
