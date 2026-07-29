'use client';

import { Fragment, useActionState, useState } from 'react';

import {
  updateCategoryAction,
  deleteCategoryAction,
  mergeCategoriesAction,
  type CategoryActionResult,
} from '@/app/actions/admin/categories';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { cx } from '@/components/ui/cx';
import styles from './page.module.css';

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount: number;
}

interface AdminCategoriesTableProps {
  categories: AdminCategoryRow[];
  emptyMessage: string;
}

const initialState: CategoryActionResult = {};

export function AdminCategoriesTable({ categories, emptyMessage }: AdminCategoriesTableProps) {
  const [updateState, updateFormAction, isUpdatePending] = useActionState(
    updateCategoryAction,
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteCategoryAction,
    initialState,
  );
  const [mergeState, mergeFormAction, isMergePending] = useActionState(
    mergeCategoriesAction,
    initialState,
  );
  const isPending = isUpdatePending || isDeletePending || isMergePending;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (categories.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div>
      {updateState.error && <Alert tone="danger">{updateState.error}</Alert>}
      {updateState.message && <Alert tone="success">{updateState.message}</Alert>}
      {deleteState.error && <Alert tone="danger">{deleteState.error}</Alert>}
      {deleteState.message && <Alert tone="success">{deleteState.message}</Alert>}
      {mergeState.error && <Alert tone="danger">{mergeState.error}</Alert>}
      {mergeState.message && <Alert tone="success">{mergeState.message}</Alert>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Products</th>
              <th className={styles.editCol}></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => {
              const open = expandedId === category.id;
              const others = categories.filter((c) => c.id !== category.id);

              return (
                <Fragment key={category.id}>
                  <tr className={cx(open && styles.rowOpen)}>
                    <td>
                      <div className={styles.supplierCell}>
                        <span className={styles.supplierName}>{category.name}</span>
                        {/* The slug is what the storefront link carries, and
                            it survives a rename — worth showing. */}
                        <span className={styles.supplierUrl}>/products?category={category.slug}</span>
                      </div>
                    </td>
                    <td className={styles.notesCell}>{category.description ?? '—'}</td>
                    <td className={cx(styles.usageCell, category.productCount === 0 && styles.usageNone)}>
                      {category.productCount}
                    </td>
                    <td className={styles.editCol}>
                      <button
                        type="button"
                        className={styles.editToggle}
                        onClick={() => setExpandedId(open ? null : category.id)}
                        aria-expanded={open}
                        aria-controls={`category-detail-${category.id}`}
                      >
                        {open ? 'Close' : 'Edit'}
                      </button>
                    </td>
                  </tr>

                  {open && (
                    <tr className={styles.detailRow}>
                      <td colSpan={4} id={`category-detail-${category.id}`}>
                        <div className={styles.detailGrid}>
                          <div className={styles.detailPanel}>
                            <h3 className={styles.detailTitle}>Details</h3>
                            <form action={updateFormAction} className={styles.editForm}>
                              <input type="hidden" name="id" value={category.id} />
                              <Field label="Name" htmlFor={`cat-name-${category.id}`}>
                                <Input
                                  type="text"
                                  id={`cat-name-${category.id}`}
                                  name="name"
                                  defaultValue={category.name}
                                  required
                                  maxLength={80}
                                />
                              </Field>
                              <Field label="Description" htmlFor={`cat-desc-${category.id}`} hint="Optional">
                                <Input
                                  type="text"
                                  id={`cat-desc-${category.id}`}
                                  name="description"
                                  defaultValue={category.description ?? ''}
                                  maxLength={500}
                                />
                              </Field>
                              <div className={styles.formActions}>
                                <Button type="submit" disabled={isPending}>
                                  Save
                                </Button>
                              </div>
                            </form>
                          </div>

                          <div className={styles.detailPanel}>
                            <h3 className={styles.detailTitle}>Merge</h3>
                            <p className={styles.deleteNote}>
                              Moves all {category.productCount} product
                              {category.productCount === 1 ? '' : 's'} into another category, then
                              deletes this one.
                            </p>
                            {others.length === 0 ? (
                              <p className={styles.empty}>Nothing to merge into yet.</p>
                            ) : (
                              <form action={mergeFormAction} className={styles.editForm}>
                                <input type="hidden" name="sourceId" value={category.id} />
                                <Select name="targetId" defaultValue="" aria-label="Merge into">
                                  <option value="">Choose a category…</option>
                                  {others.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </Select>
                                <div className={styles.formActions}>
                                  <Button type="submit" variant="secondary" disabled={isPending}>
                                    Merge
                                  </Button>
                                </div>
                              </form>
                            )}
                          </div>

                          <div className={styles.detailActions}>
                            <form action={deleteFormAction}>
                              <input type="hidden" name="id" value={category.id} />
                              {/* Delete is always offered: the FK is ON DELETE
                                  SET NULL, so products survive and simply
                                  become uncategorized. */}
                              <p className={styles.deleteNote}>
                                {category.productCount === 0
                                  ? 'Nothing is in this category.'
                                  : `${category.productCount} product${category.productCount === 1 ? '' : 's'} will become uncategorized.`}
                              </p>
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
    </div>
  );
}
