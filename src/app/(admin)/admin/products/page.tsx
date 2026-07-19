import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { ProductActionsBar } from './ProductActionsBar';
import { SupplierFilterSelect } from './SupplierFilterSelect';
import { AdminProductsTable, type AdminProductRow } from './AdminProductsTable';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Pagination } from '@/components/ui/Pagination';
import { paginate, parsePage, DEFAULT_PAGE_SIZE } from '@/components/ui/paginate';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
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

  const { listAllProductsForAdmin, listSuppliers, listSupplierOffersForVariant } =
    getContainer();
  const [allProducts, suppliers] = await Promise.all([
    listAllProductsForAdmin.execute(),
    listSuppliers.execute(),
  ]);
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name] as const));
  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  const offersByVariant = new Map<string, SupplierOffer[]>(
    await Promise.all(
      allProducts
        .flatMap((p) => p.variants)
        .map(
          async (v) =>
            [v.id, await listSupplierOffersForVariant.execute({ variantId: v.id })] as const,
        ),
    ),
  );

  const products = supplierId
    ? allProducts.filter((p) =>
        p.variants.some((v) =>
          (offersByVariant.get(v.id) ?? []).some((offer) => offer.supplierId === supplierId),
        ),
      )
    : allProducts;

  const { items: pagedProducts, page, totalPages } = paginate(
    products,
    parsePage(pageParam),
    DEFAULT_PAGE_SIZE,
  );

  const rows: AdminProductRow[] = pagedProducts.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug.value,
    status: p.status,
    imageUrl: p.imageUrl,
    additionalImages: p.additionalImages,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      priceDisplay: v.price.toString(),
      offers: (offersByVariant.get(v.id) ?? []).map((offer) => ({
        id: offer.id,
        supplierId: offer.supplierId,
        supplierName: supplierNameById.get(offer.supplierId) ?? offer.supplierId,
        isPreferred: offer.isPreferred,
        costDisplay: offer.cost.toString(),
      })),
    })),
  }));

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Products</h1>

        <div className={styles.toolbar}>
          <ProductActionsBar suppliers={supplierOptions} />
          <div className={styles.filterRow}>
            <SupplierFilterSelect suppliers={supplierOptions} selectedSupplierId={supplierId} />
          </div>
        </div>

        <section>
          <h2 className={styles.sectionTitle}>Existing products</h2>
          <AdminProductsTable
            products={rows}
            emptyMessage={supplierId ? 'No products from this supplier.' : 'No products yet.'}
          />

          <Pagination
            page={page}
            totalPages={totalPages}
            buildHref={(p) => buildHref(supplierId, p)}
          />
        </section>
      </Stack>
    </PageContainer>
  );
}
