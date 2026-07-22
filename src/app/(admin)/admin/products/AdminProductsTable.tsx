'use client';

import { useActionState } from 'react';

import {
  deleteProductsAction,
  publishProductsAction,
  unpublishProductsAction,
  applyMarkupToProductsAction,
  assignCategoryToProductsAction,
  type DeleteProductsActionResult,
  type PublishProductsActionResult,
  type UnpublishProductsActionResult,
  type ApplyMarkupActionResult,
  type AssignCategoryActionResult,
} from '@/app/actions/admin/catalog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Stack } from '@/components/ui/Stack';
import { ProductImagesManager } from './ProductImagesManager';
import { ProductCategoryEditor } from './ProductCategoryEditor';
import { VariantPriceEditor } from './VariantPriceEditor';
import { SupplierOfferCostEditor } from './SupplierOfferCostEditor';
import { AddVariantForm } from './AddVariantForm';
import styles from './page.module.css';

export interface AdminProductOfferRow {
  id: string;
  supplierId: string;
  supplierName: string;
  isPreferred: boolean;
  costAmountMinor: number;
  currency: string;
}

export interface AdminProductVariantRow {
  id: string;
  sku: string;
  name: string;
  priceAmountMinor: number;
  currency: string;
  hasNoOffers: boolean;
  offers: AdminProductOfferRow[];
}

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  category: string | null;
  imageUrl: string | null;
  additionalImages: { id: string; url: string }[];
  variants: AdminProductVariantRow[];
}

interface AdminProductsTableProps {
  products: AdminProductRow[];
  emptyMessage: string;
}

const deleteInitialState: DeleteProductsActionResult = {};
const publishInitialState: PublishProductsActionResult = {};
const unpublishInitialState: UnpublishProductsActionResult = {};
const markupInitialState: ApplyMarkupActionResult = {};
const assignCategoryInitialState: AssignCategoryActionResult = {};
const BULK_FORM_ID = 'admin-products-bulk-actions';

export function AdminProductsTable({ products, emptyMessage }: AdminProductsTableProps) {
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteProductsAction,
    deleteInitialState,
  );
  const [publishState, publishFormAction, isPublishPending] = useActionState(
    publishProductsAction,
    publishInitialState,
  );
  const [unpublishState, unpublishFormAction, isUnpublishPending] = useActionState(
    unpublishProductsAction,
    unpublishInitialState,
  );
  const [markupState, markupFormAction, isMarkupPending] = useActionState(
    applyMarkupToProductsAction,
    markupInitialState,
  );
  const [assignCategoryState, assignCategoryFormAction, isAssignCategoryPending] = useActionState(
    assignCategoryToProductsAction,
    assignCategoryInitialState,
  );
  const isPending =
    isDeletePending || isPublishPending || isUnpublishPending || isMarkupPending || isAssignCategoryPending;

  if (products.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div>
      <form id={BULK_FORM_ID} action={deleteFormAction} />

      {publishState.error && <Alert tone="danger">{publishState.error}</Alert>}
      {publishState.message && <Alert tone="success">{publishState.message}</Alert>}
      {unpublishState.error && <Alert tone="danger">{unpublishState.error}</Alert>}
      {unpublishState.message && <Alert tone="success">{unpublishState.message}</Alert>}
      {deleteState.error && <Alert tone="danger">{deleteState.error}</Alert>}
      {deleteState.message && <Alert tone="success">{deleteState.message}</Alert>}
      {markupState.error && <Alert tone="danger">{markupState.error}</Alert>}
      {markupState.message && <Alert tone="success">{markupState.message}</Alert>}
      {assignCategoryState.error && <Alert tone="danger">{assignCategoryState.error}</Alert>}
      {assignCategoryState.message && <Alert tone="success">{assignCategoryState.message}</Alert>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th></th>
              <th>Product</th>
              <th>Status</th>
              <th>Images</th>
              <th>Variants &amp; supplier offers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    type="checkbox"
                    name="productIds"
                    value={p.id}
                    form={BULK_FORM_ID}
                    aria-label={`Select ${p.name}`}
                  />
                </td>
                <td className={styles.productCell}>
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className={styles.thumb} />
                  )}
                  <div>
                    <div>{p.name}</div>
                    <span className={styles.slug}>{p.slug}</span>
                    <ProductCategoryEditor productId={p.id} category={p.category} />
                  </div>
                </td>
                <td>
                  <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                </td>
                <td>
                  <ProductImagesManager
                    productId={p.id}
                    productName={p.name}
                    imageUrl={p.imageUrl}
                    additionalImages={p.additionalImages}
                  />
                </td>
                <td>
                  <Stack gap={3}>
                    {p.variants.map((v) => (
                      <div key={v.id} className={styles.variantBlock}>
                        <p className={styles.variantHeading}>
                          {v.name} ({v.sku})
                          {v.hasNoOffers && (
                            <Badge tone="danger" className={styles.preferredBadge}>
                              No supplier offer
                            </Badge>
                          )}
                        </p>
                        <VariantPriceEditor
                          variantId={v.id}
                          priceAmountMinor={v.priceAmountMinor}
                          currency={v.currency}
                        />

                        <ul className={styles.offerList}>
                          {v.offers.map((offer) => (
                            <li key={offer.id} className={styles.offerRow}>
                              <div className={styles.offerInfo}>
                                <span>
                                  {offer.supplierName}
                                  {offer.isPreferred && (
                                    <Badge tone="accent" className={styles.preferredBadge}>
                                      preferred
                                    </Badge>
                                  )}
                                </span>
                                <div className={styles.offerCost}>
                                  cost
                                  <SupplierOfferCostEditor
                                    offerId={offer.id}
                                    costAmountMinor={offer.costAmountMinor}
                                    currency={offer.currency}
                                  />
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <AddVariantForm productId={p.id} />
                  </Stack>
                </td>
                <td className={styles.rowActions}>
                  <form action={deleteFormAction}>
                    <input type="hidden" name="productIds" value={p.id} />
                    {p.status === 'active' ? (
                      <Button
                        type="submit"
                        formAction={unpublishFormAction}
                        variant="secondary"
                        disabled={isPending}
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        formAction={publishFormAction}
                        variant="secondary"
                        disabled={isPending}
                      >
                        Publish
                      </Button>
                    )}
                    <Button type="submit" variant="danger" disabled={isPending}>
                      Delete
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.bulkActions}>
        <Button
          type="submit"
          form={BULK_FORM_ID}
          formAction={publishFormAction}
          variant="secondary"
          disabled={isPending}
        >
          Publish selected
        </Button>
        <Button
          type="submit"
          form={BULK_FORM_ID}
          formAction={unpublishFormAction}
          variant="secondary"
          disabled={isPending}
        >
          Unpublish selected
        </Button>
        <Button type="submit" form={BULK_FORM_ID} variant="danger" disabled={isPending}>
          Delete selected
        </Button>
        <div className={styles.markupGroup}>
          <Input
            type="number"
            name="markupPercent"
            step="0.1"
            placeholder="Markup %"
            form={BULK_FORM_ID}
            className={styles.markupInput}
            aria-label="Markup percentage"
          />
          <Button
            type="submit"
            form={BULK_FORM_ID}
            formAction={markupFormAction}
            variant="secondary"
            disabled={isPending}
          >
            Apply markup to selected
          </Button>
        </div>
        <div className={styles.markupGroup}>
          <Input
            type="text"
            name="category"
            placeholder="Category"
            form={BULK_FORM_ID}
            className={styles.markupInput}
            aria-label="Category"
          />
          <Button
            type="submit"
            form={BULK_FORM_ID}
            formAction={assignCategoryFormAction}
            variant="secondary"
            disabled={isPending}
          >
            Assign category to selected
          </Button>
        </div>
      </div>
    </div>
  );
}
