import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { supplierOfferSyncStatusTone } from '@/app/lib/status-tone';
import {
  createProductWithOfferAction,
  createSupplierAction,
  setAutoSyncEnabledAction,
  syncSupplierOfferAction,
} from '@/app/actions/admin/catalog';
import { ImportFeedForm } from './ImportFeedForm';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { SupplierOffer } from '@/modules/sourcing/domain/supplier-offer';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  await requireAdmin();

  const { listAllProductsForAdmin, listSuppliers, listSupplierOffersForVariant } =
    getContainer();
  const [products, suppliers] = await Promise.all([
    listAllProductsForAdmin.execute(),
    listSuppliers.execute(),
  ]);
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name] as const));

  const offersByVariant = new Map<string, SupplierOffer[]>(
    await Promise.all(
      products
        .flatMap((p) => p.variants)
        .map(
          async (v) =>
            [v.id, await listSupplierOffersForVariant.execute({ variantId: v.id })] as const,
        ),
    ),
  );

  return (
    <PageContainer>
      <Stack gap={5}>
        <h1>Products</h1>

        <section>
          <h2 className={styles.sectionTitle}>Existing products</h2>
          <Stack gap={3}>
            {products.length === 0 && <p className={styles.empty}>No products yet.</p>}
            {products.map((p) => (
              <Card key={p.id}>
                <div className={styles.productHeader}>
                  <strong>{p.name}</strong>
                  <span className={styles.slug}>{p.slug.value}</span>
                  <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                </div>

                <Stack gap={3}>
                  {p.variants.map((v) => (
                    <div key={v.id} className={styles.variantBlock}>
                      <p className={styles.variantHeading}>
                        {v.sku}: {v.price.toString()}
                      </p>

                      <ul className={styles.offerList}>
                        {(offersByVariant.get(v.id) ?? []).map((offer) => (
                          <li key={offer.id} className={styles.offerRow}>
                            <div className={styles.offerInfo}>
                              <span>
                                {supplierNameById.get(offer.supplierId) ?? offer.supplierId}
                                {offer.isPreferred && (
                                  <Badge tone="accent">preferred</Badge>
                                )}
                              </span>
                              <span className={styles.offerCost}>
                                cost {offer.cost.toString()}
                              </span>
                              <Badge tone={supplierOfferSyncStatusTone(offer.lastSyncStatus)}>
                                {offer.lastSyncStatus}
                              </Badge>
                              {offer.lastSyncedAt && (
                                <span className={styles.syncedAt}>
                                  {new Date(offer.lastSyncedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {offer.scrapedTitle && (
                              <p className={styles.scrapedTitle}>
                                Scraped title: &ldquo;{offer.scrapedTitle}&rdquo;
                              </p>
                            )}
                            {offer.lastSyncError && (
                              <p className={styles.syncError}>{offer.lastSyncError}</p>
                            )}
                            <div className={styles.offerActions}>
                              <form action={syncSupplierOfferAction}>
                                <input
                                  type="hidden"
                                  name="supplierOfferId"
                                  value={offer.id}
                                />
                                <Button type="submit" variant="secondary">
                                  Sync now
                                </Button>
                              </form>
                              <form action={setAutoSyncEnabledAction}>
                                <input type="hidden" name="offerId" value={offer.id} />
                                <input
                                  type="hidden"
                                  name="enabled"
                                  value={String(!offer.autoSyncEnabled)}
                                />
                                <Button type="submit" variant="ghost">
                                  {offer.autoSyncEnabled
                                    ? 'Disable auto-sync'
                                    : 'Enable auto-sync'}
                                </Button>
                              </form>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Stack>
              </Card>
            ))}
          </Stack>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Add supplier</h2>
          <Card className={styles.formCard}>
            <form action={createSupplierAction}>
              <Field label="Name" htmlFor="supplierName">
                <Input type="text" id="supplierName" name="name" required />
              </Field>
              <Field label="URL" htmlFor="supplierUrl">
                <Input type="url" id="supplierUrl" name="url" required />
              </Field>
              <Field label="Notes" htmlFor="supplierNotes" hint="Optional">
                <Input type="text" id="supplierNotes" name="notes" />
              </Field>
              <Button type="submit">Add supplier</Button>
            </form>
          </Card>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Import from JSON feed</h2>
          {suppliers.length === 0 ? (
            <p className={styles.empty}>Add a supplier first.</p>
          ) : (
            <Card className={styles.formCard}>
              <ImportFeedForm
                suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
              />
            </Card>
          )}
        </section>

        <section>
          <h2 className={styles.sectionTitle}>Add product</h2>
          {suppliers.length === 0 ? (
            <p className={styles.empty}>Add a supplier first.</p>
          ) : (
            <Card className={styles.formCard}>
              <form action={createProductWithOfferAction}>
                <div className={styles.row}>
                  <Field label="Slug" htmlFor="slug" className={styles.rowField}>
                    <Input type="text" id="slug" name="slug" required />
                  </Field>
                  <Field label="Name" htmlFor="name" className={styles.rowField}>
                    <Input type="text" id="name" name="name" required />
                  </Field>
                </div>
                <Field label="Description" htmlFor="description" hint="Optional">
                  <Input type="text" id="description" name="description" />
                </Field>

                <div className={styles.row}>
                  <Field label="SKU" htmlFor="sku" className={styles.rowField}>
                    <Input type="text" id="sku" name="sku" required />
                  </Field>
                  <Field
                    label="Sell price (minor units)"
                    htmlFor="unitAmountMinor"
                    hint="e.g. cents"
                    className={styles.rowField}
                  >
                    <Input
                      type="number"
                      id="unitAmountMinor"
                      name="unitAmountMinor"
                      min={1}
                      required
                    />
                  </Field>
                  <Field label="Currency" htmlFor="currency" className={styles.rowField}>
                    <Input type="text" id="currency" name="currency" defaultValue="USD" required />
                  </Field>
                </div>

                <Field label="Supplier" htmlFor="supplierId">
                  <Select id="supplierId" name="supplierId" required defaultValue="">
                    <option value="" disabled>
                      Select a supplier
                    </option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Supplier product URL" htmlFor="supplierProductUrl">
                  <Input type="url" id="supplierProductUrl" name="supplierProductUrl" required />
                </Field>

                <div className={styles.row}>
                  <Field
                    label="Cost (minor units)"
                    htmlFor="costAmountMinor"
                    className={styles.rowField}
                  >
                    <Input
                      type="number"
                      id="costAmountMinor"
                      name="costAmountMinor"
                      min={1}
                      required
                    />
                  </Field>
                  <Field
                    label="Cost currency"
                    htmlFor="costCurrency"
                    className={styles.rowField}
                  >
                    <Input
                      type="text"
                      id="costCurrency"
                      name="costCurrency"
                      defaultValue="USD"
                      required
                    />
                  </Field>
                </div>

                <Button type="submit">Add product</Button>
              </form>
            </Card>
          )}
        </section>
      </Stack>
    </PageContainer>
  );
}
