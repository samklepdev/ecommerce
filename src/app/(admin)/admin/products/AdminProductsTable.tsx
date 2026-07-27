'use client';

import { Fragment, useActionState, useState } from 'react';

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
import { cx } from '@/components/ui/cx';
import { ProductImagesManager } from './ProductImagesManager';
import { ProductCategoryEditor } from './ProductCategoryEditor';
import { ProductDetailsEditor } from './ProductDetailsEditor';
import { ProductPriceEditor } from './ProductPriceEditor';
import { SupplierOfferCostEditor } from './SupplierOfferCostEditor';
import { AddSupplierOfferForm } from './AddSupplierOfferForm';
import { SetPreferredOfferButton } from './SetPreferredOfferButton';
import styles from './page.module.css';

export interface AdminProductOfferRow {
  id: string;
  supplierId: string;
  supplierName: string;
  isPreferred: boolean;
  costAmountMinor: number;
  currency: string;
}



export interface AdminProductRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  status: string;
  category: string | null;
  imageUrl: string | null;
  additionalImages: { id: string; url: string }[];
  sku: string;
  priceAmountMinor: number;
  currency: string;
  hasNoOffers: boolean;
  offers: AdminProductOfferRow[];
}

interface Supplier {
  id: string;
  name: string;
}

interface AdminProductsTableProps {
  products: AdminProductRow[];
  emptyMessage: string;
  suppliers: Supplier[];
}

const deleteInitialState: DeleteProductsActionResult = {};
const publishInitialState: PublishProductsActionResult = {};
const unpublishInitialState: UnpublishProductsActionResult = {};
const markupInitialState: ApplyMarkupActionResult = {};
const assignCategoryInitialState: AssignCategoryActionResult = {};
const BULK_FORM_ID = 'admin-products-bulk-actions';

function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

export function AdminProductsTable({ products, emptyMessage, suppliers }: AdminProductsTableProps) {
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
              <th className={styles.selectCol}></th>
              <th>Product</th>
              <th>Status</th>
              <th>SKU</th>
              <th className={styles.numCol}>Price</th>
              <th>Sourcing</th>
              <th className={styles.editCol}></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const open = expandedId === p.id;
              const preferred = p.offers.find((o) => o.isPreferred) ?? null;

              return (
                <Fragment key={p.id}>
                  <tr className={cx(open && styles.rowOpen)}>
                    <td className={styles.selectCol}>
                      <input
                        type="checkbox"
                        name="productIds"
                        value={p.id}
                        form={BULK_FORM_ID}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td>
                      <div className={styles.productCell}>
                        {p.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className={styles.thumb} />
                        )}
                        <div className={styles.productText}>
                          <span className={styles.productName}>{p.name}</span>
                          <span className={styles.slug}>{p.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                    </td>
                    <td className={styles.skuCell}>{p.sku}</td>
                    <td className={styles.numCol}>{formatMoney(p.priceAmountMinor, p.currency)}</td>
                    <td>
                      {p.hasNoOffers ? (
                        <Badge tone="danger">No supplier offer</Badge>
                      ) : (
                        <span className={styles.sourcingCell}>
                          {preferred ? preferred.supplierName : 'None preferred'}
                          {p.offers.length > 1 && (
                            <span className={styles.offerCount}>+{p.offers.length - 1}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={styles.editCol}>
                      {/* Everything editable lives behind this. A row that is
                          also six live forms can't be scanned, and scanning is
                          what this page is for most of the time. */}
                      <button
                        type="button"
                        className={styles.editToggle}
                        onClick={() => setExpandedId(open ? null : p.id)}
                        aria-expanded={open}
                        aria-controls={`product-detail-${p.id}`}
                      >
                        {open ? 'Close' : 'Edit'}
                      </button>
                    </td>
                  </tr>

                  {open && (
                    <tr className={styles.detailRow}>
                      <td colSpan={7} id={`product-detail-${p.id}`}>
                        <div className={styles.detailGrid}>
                          <section className={styles.detailPanel}>
                            <h3 className={styles.detailTitle}>Details</h3>
                            <ProductDetailsEditor
                              productId={p.id}
                              name={p.name}
                              description={p.description}
                            />
                            <ProductCategoryEditor productId={p.id} category={p.category} />
                          </section>

                          <section className={styles.detailPanel}>
                            <h3 className={styles.detailTitle}>Price</h3>
                            <ProductPriceEditor
                              productId={p.id}
                              priceAmountMinor={p.priceAmountMinor}
                              currency={p.currency}
                            />
                          </section>

                          <section className={styles.detailPanel}>
                            <h3 className={styles.detailTitle}>Images</h3>
                            <ProductImagesManager
                              productId={p.id}
                              productName={p.name}
                              imageUrl={p.imageUrl}
                              additionalImages={p.additionalImages}
                            />
                          </section>

                          <section className={cx(styles.detailPanel, styles.detailWide)}>
                            <h3 className={styles.detailTitle}>Sourcing</h3>
                            <ul className={styles.offerList}>
                              {p.offers.map((offer) => (
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
                                    {!offer.isPreferred && (
                                      <SetPreferredOfferButton offerId={offer.id} productId={p.id} />
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                            <AddSupplierOfferForm productId={p.id} suppliers={suppliers} />
                          </section>

                          <div className={styles.detailActions}>
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
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.bulkActions}>
        <span className={styles.bulkLabel}>Selected</span>
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
