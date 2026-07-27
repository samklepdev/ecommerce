'use client';

import { useActionState } from 'react';

import { updateProductAction, type UpdateProductActionResult } from '@/app/actions/admin/catalog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input, Textarea } from '@/components/ui/Input';
import { ProductImagesManager } from './ProductImagesManager';
import { SupplierOfferCostEditor } from './SupplierOfferCostEditor';
import { AddSupplierOfferForm } from './AddSupplierOfferForm';
import { SetPreferredOfferButton } from './SetPreferredOfferButton';
import type { AdminProductRow } from './AdminProductsTable';
import styles from './ProductEditPanel.module.css';

interface Supplier {
  id: string;
  name: string;
}

interface ProductEditPanelProps {
  product: AdminProductRow;
  suppliers: Supplier[];
  /** Rendered into the panel's footer beside Save — publishing and deleting
   * belong to the table's bulk forms, so they're passed in rather than
   * re-implemented here. */
  actions: React.ReactNode;
}

const initialState: UpdateProductActionResult = {};

/**
 * One product, one form, one Save.
 *
 * Replaces the four always-live inline editors this panel used to stack
 * (name/description, category, price, each with its own button and its own
 * alert). Those made the panel read as four competing forms in a small
 * space. Images and sourcing keep their own controls because they act on
 * other records — an image upload and a supplier offer aren't fields of the
 * product, and pretending they save together would be a lie.
 */
export function ProductEditPanel({ product, suppliers, actions }: ProductEditPanelProps) {
  const [state, formAction, isPending] = useActionState(updateProductAction, initialState);

  return (
    <div className={styles.panel}>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="currency" value={product.currency} />

        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <Input type="text" name="name" defaultValue={product.name} required />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Price ({product.currency})</span>
            <Input
              type="number"
              name="price"
              step="0.01"
              min="0"
              defaultValue={(product.priceAmountMinor / 100).toFixed(2)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Category</span>
            <Input
              type="text"
              name="category"
              defaultValue={product.category ?? ''}
              placeholder="Uncategorized"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Slug</span>
            {/* Permanent by design, so shared product URLs never break —
                shown because it's useful to read, disabled because it isn't
                editable. */}
            <Input type="text" value={product.slug} disabled readOnly />
          </label>

          <label className={styles.fieldWide}>
            <span className={styles.label}>Description</span>
            <Textarea
              name="description"
              defaultValue={product.description ?? ''}
              placeholder="No description"
              rows={5}
            />
          </label>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerMessage} aria-live="polite">
            {state.error && <Alert tone="danger">{state.error}</Alert>}
            {state.message && <Alert tone="success">{state.message}</Alert>}
          </div>
          <div className={styles.footerActions}>
            {actions}
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>

      <div className={styles.aside}>
        <section className={styles.asideSection}>
          <h3 className={styles.asideTitle}>Images</h3>
          <ProductImagesManager
            productId={product.id}
            productName={product.name}
            imageUrl={product.imageUrl}
            additionalImages={product.additionalImages}
          />
        </section>

        <section className={styles.asideSection}>
          <h3 className={styles.asideTitle}>Sourcing</h3>
          {product.offers.length === 0 && (
            <p className={styles.asideNote}>
              No supplier offer yet — this product can&apos;t be fulfilled until it has one.
            </p>
          )}
          <ul className={styles.offerList}>
            {product.offers.map((offer) => (
              <li key={offer.id} className={styles.offerRow}>
                <div className={styles.offerHead}>
                  <span className={styles.offerSupplier}>{offer.supplierName}</span>
                  {offer.isPreferred ? (
                    <Badge tone="accent">preferred</Badge>
                  ) : (
                    <SetPreferredOfferButton offerId={offer.id} productId={product.id} />
                  )}
                </div>
                <div className={styles.offerCost}>
                  <span className={styles.label}>Cost</span>
                  <SupplierOfferCostEditor
                    offerId={offer.id}
                    costAmountMinor={offer.costAmountMinor}
                    currency={offer.currency}
                  />
                </div>
              </li>
            ))}
          </ul>
          <AddSupplierOfferForm productId={product.id} suppliers={suppliers} />
        </section>
      </div>
    </div>
  );
}
