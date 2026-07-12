import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { createProductWithOfferAction, createSupplierAction } from '@/app/actions/admin/catalog';
import { PageContainer } from '@/components/ui/PageContainer';
import { Stack } from '@/components/ui/Stack';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  await requireAdmin();

  const { listAllProductsForAdmin, listSuppliers } = getContainer();
  const [products, suppliers] = await Promise.all([
    listAllProductsForAdmin.execute(),
    listSuppliers.execute(),
  ]);

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
                <ul className={styles.variantList}>
                  {p.variants.map((v) => (
                    <li key={v.id}>
                      {v.sku}: {v.price.toString()}
                    </li>
                  ))}
                </ul>
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
