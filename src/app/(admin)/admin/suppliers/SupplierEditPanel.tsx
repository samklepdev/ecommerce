'use client';

import { useActionState } from 'react';

import {
  updateSupplierAction,
  type UpdateSupplierActionResult,
} from '@/app/actions/admin/suppliers';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import styles from './page.module.css';

const initialState: UpdateSupplierActionResult = {};

export interface SupplierEditPanelProps {
  id: string;
  name: string;
  url: string;
  notes: string | null;
  /** Deactivate/reactivate and delete, rendered by the table so the panel
   * stays a plain edit form — same split as `ProductEditPanel`. */
  actions: React.ReactNode;
}

/** Everything editable about a supplier, behind the row's Edit toggle. A row
 * that is also three live forms can't be scanned, and scanning is what this
 * page is for most of the time. */
export function SupplierEditPanel({ id, name, url, notes, actions }: SupplierEditPanelProps) {
  const [state, formAction, isPending] = useActionState(updateSupplierAction, initialState);

  return (
    <div className={styles.detailGrid}>
      <div className={styles.detailPanel}>
        <h3 className={styles.detailTitle}>Details</h3>
        <form action={formAction} className={styles.editForm}>
          <input type="hidden" name="id" value={id} />
          <Field label="Name" htmlFor={`supplier-name-${id}`}>
            <Input
              type="text"
              id={`supplier-name-${id}`}
              name="name"
              defaultValue={name}
              required
            />
          </Field>
          <Field label="URL" htmlFor={`supplier-url-${id}`}>
            <Input type="url" id={`supplier-url-${id}`} name="url" defaultValue={url} required />
          </Field>
          <Field label="Notes" htmlFor={`supplier-notes-${id}`} hint="Optional">
            <Input
              type="text"
              id={`supplier-notes-${id}`}
              name="notes"
              defaultValue={notes ?? ''}
            />
          </Field>

          {state.error && <Alert tone="danger">{state.error}</Alert>}
          {state.message && <Alert tone="success">{state.message}</Alert>}

          <div className={styles.formActions}>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </div>

      <div className={styles.detailActions}>{actions}</div>
    </div>
  );
}
