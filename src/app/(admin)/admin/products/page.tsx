import { getContainer } from '@/composition/container';
import { requireAdmin } from '@/app/lib/session';
import { createProductWithOfferAction, createSupplierAction } from '@/app/actions/admin/catalog';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  await requireAdmin();

  const { listAllProductsForAdmin, listSuppliers } = getContainer();
  const [products, suppliers] = await Promise.all([
    listAllProductsForAdmin.execute(),
    listSuppliers.execute(),
  ]);

  return (
    <main>
      <h1>Products</h1>

      <section>
        <h2>Existing products</h2>
        <ul>
          {products.map((p) => (
            <li key={p.id}>
              {p.name} ({p.slug.value}) — {p.status}
              <ul>
                {p.variants.map((v) => (
                  <li key={v.id}>
                    {v.sku}: {v.price.toString()}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Add supplier</h2>
        <form action={createSupplierAction}>
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            URL
            <input type="url" name="url" required />
          </label>
          <label>
            Notes
            <input type="text" name="notes" />
          </label>
          <button type="submit">Add supplier</button>
        </form>
      </section>

      <section>
        <h2>Add product</h2>
        {suppliers.length === 0 ? (
          <p>Add a supplier first.</p>
        ) : (
          <form action={createProductWithOfferAction}>
            <label>
              Slug
              <input type="text" name="slug" required />
            </label>
            <label>
              Name
              <input type="text" name="name" required />
            </label>
            <label>
              Description
              <input type="text" name="description" />
            </label>
            <label>
              SKU
              <input type="text" name="sku" required />
            </label>
            <label>
              Sell price (minor units, e.g. cents)
              <input type="number" name="unitAmountMinor" min={1} required />
            </label>
            <label>
              Currency
              <input type="text" name="currency" defaultValue="USD" required />
            </label>
            <label>
              Supplier
              <select name="supplierId" required>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Supplier product URL
              <input type="url" name="supplierProductUrl" required />
            </label>
            <label>
              Cost (minor units)
              <input type="number" name="costAmountMinor" min={1} required />
            </label>
            <label>
              Cost currency
              <input type="text" name="costCurrency" defaultValue="USD" required />
            </label>
            <button type="submit">Add product</button>
          </form>
        )}
      </section>
    </main>
  );
}
