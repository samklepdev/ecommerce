'use client';

import { Fragment, useActionState, useState } from 'react';

import {
  setSupplierActiveAction,
  deleteSupplierAction,
  type SetSupplierActiveActionResult,
  type DeleteSupplierActionResult,
} from '@/app/actions/admin/suppliers';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ReauthPrompt } from '@/components/admin/ReauthPrompt';
import { REAUTH_REQUIRED } from '@/app/lib/session-constants';
import { cx } from '@/components/ui/cx';
import { SupplierEditPanel } from './SupplierEditPanel';
import styles from './page.module.css';

export interface AdminSupplierRow {
  id: string;
  name: string;
  url: string;
  notes: string | null;
  isActive: boolean;
  offerCount: number;
  supplierOrderCount: number;
}

interface AdminSuppliersTableProps {
  suppliers: AdminSupplierRow[];
  emptyMessage: string;
}

const toggleInitialState: SetSupplierActiveActionResult = {};
const deleteInitialState: DeleteSupplierActionResult = {};

function usageLabel(row: AdminSupplierRow): string {
  const parts = [
    `${row.offerCount} offer${row.offerCount === 1 ? '' : 's'}`,
    `${row.supplierOrderCount} order${row.supplierOrderCount === 1 ? '' : 's'}`,
  ];
  return parts.join(' · ');
}

export function AdminSuppliersTable({ suppliers, emptyMessage }: AdminSuppliersTableProps) {
  const [toggleState, toggleFormAction, isTogglePending] = useActionState(
    setSupplierActiveAction,
    toggleInitialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteSupplierAction,
    deleteInitialState,
  );
  const isPending = isTogglePending || isDeletePending;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (suppliers.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div>
      {toggleState.error && <Alert tone="danger">{toggleState.error}</Alert>}
      {toggleState.message && <Alert tone="success">{toggleState.message}</Alert>}
      {deleteState.error === REAUTH_REQUIRED ? (
        <ReauthPrompt action="delete this supplier" />
      ) : (
        deleteState.error && <Alert tone="danger">{deleteState.error}</Alert>
      )}
      {deleteState.message && <Alert tone="success">{deleteState.message}</Alert>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Referenced by</th>
              <th className={styles.editCol}></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => {
              const open = expandedId === s.id;
              const isReferenced = s.offerCount > 0 || s.supplierOrderCount > 0;

              return (
                <Fragment key={s.id}>
                  <tr className={cx(open && styles.rowOpen)}>
                    <td>
                      <div className={styles.supplierCell}>
                        <span className={styles.supplierName}>{s.name}</span>
                        <span className={styles.supplierUrl}>{s.url}</span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={s.isActive ? 'success' : 'neutral'}>
                        {s.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </td>
                    <td className={styles.notesCell}>{s.notes ?? '—'}</td>
                    <td className={cx(styles.usageCell, !isReferenced && styles.usageNone)}>
                      {usageLabel(s)}
                    </td>
                    <td className={styles.editCol}>
                      <button
                        type="button"
                        className={styles.editToggle}
                        onClick={() => setExpandedId(open ? null : s.id)}
                        aria-expanded={open}
                        aria-controls={`supplier-detail-${s.id}`}
                      >
                        {open ? 'Close' : 'Edit'}
                      </button>
                    </td>
                  </tr>

                  {open && (
                    <tr className={styles.detailRow}>
                      <td colSpan={5} id={`supplier-detail-${s.id}`}>
                        <SupplierEditPanel
                          id={s.id}
                          name={s.name}
                          url={s.url}
                          notes={s.notes}
                          actions={
                            <form action={deleteFormAction}>
                              <input type="hidden" name="id" value={s.id} />
                              <Button
                                type="submit"
                                formAction={toggleFormAction}
                                name="isActive"
                                value={String(!s.isActive)}
                                variant="secondary"
                                disabled={isPending}
                              >
                                {s.isActive ? 'Deactivate' : 'Reactivate'}
                              </Button>
                              {/* Delete is offered only when nothing points
                                  at the supplier. Otherwise the row says so
                                  where the button would have been, rather
                                  than failing after the click. */}
                              {isReferenced ? (
                                <p className={styles.deleteNote}>
                                  Referenced by {usageLabel(s)} — deactivate instead.
                                </p>
                              ) : (
                                <Button type="submit" variant="danger" disabled={isPending}>
                                  Delete
                                </Button>
                              )}
                            </form>
                          }
                        />
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
